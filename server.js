var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var passport = require('passport');
var mongoose = require('mongoose');
var nodemailer = require('nodemailer');
var flash = require('express-flash');
var passportLocal = require('passport-local');
var bcrypt = require('bcrypt-nodejs');
var async = require('async');
var crypto = require('crypto');
var moment = require('moment');

var app = express();

function strategy(username, password, done) {
	User.findOne({
		username: username
	}, function(err, user) {
		if (err) {
			return done(err);
		}
		if (!user) {
			return done(null, false, {
				message: 'Incorrect username.'
			});
		}
		user.comparePassword(password, function(err, isMatch) {
			if (isMatch) {
				return done(null, user);
			}
			else {
				return done(null, false, {
					message: 'Incorrect password.'
				});
			}
		});
	});
};

passport.use(new passportLocal.Strategy(strategy));

passport.serializeUser(function(user, done) {
	done(null, user.id);
});

passport.deserializeUser(function(id, done) {
	User.findById(id, function(err, user) {
		done(err, user);
	});
});

var userSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		unique: true
	},
	email: {
		type: String,
		required: true,
		unique: true
	},
	password: {
		type: String,
		required: true
	},
	resetPasswordToken: String,
	resetPasswordExpires: Date
});

var trackSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		unique: true
	},
	data: [{
		date: {
			type: Date,
			required: true
		},
		miles: {
			type: Number,
			required: true
		}
	}]
});

// hash
userSchema.pre('save', function(next) {
	var user = this;
	var SALT_FACTOR = 5;

	if (!user.isModified('password'))
		return next();

	bcrypt.genSalt(SALT_FACTOR, function(err, salt) {
		if (err)
			return next(err);

		bcrypt.hash(user.password, salt, null, function(err, hash) {
			if (err)
				return next(err);
			user.password = hash;
			next();
		});
	});
});

userSchema.methods.comparePassword = function(candidatePassword, cb) {
	bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
		if (err)
			return cb(err);
		cb(null, isMatch);
	});
};

var User = mongoose.model('User', userSchema);
var Track = mongoose.model('Track', trackSchema);

mongoose.connect(process.env.MONGOHQ_URL || process.env.IP);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /client
// app.use(favicon(__dirname + '/client/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'client')));

// setup session
var sessionOpts = {
	// store : new RedisStore(),
	secret: 'Elementereigh',
	resave: false,
	saveUninitialized: true,
	cookie: {}
};
if (app.get('env') === 'production') {
	app.set('trust proxy', 1); // trust first proxy
	sessionOpts.cookie.secure = true; // serve secure cookies
}
app.use(session(sessionOpts));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// check login
app.use(function(req, res, next) {
	console.log('session=' + req.session + ', user=' + req.user);
	next();
});

// routes
//var routeIndex = require('./routes/index');
//var routeUsers = require('./routes/users');
//
//app.use('/', routeIndex);
//app.use('/users/', routeUsers);

app.get('/', function(req, res) {
	if (!req.user) {
		res.redirect('/login');
	}
	else {
		res.render('index', {
			user: req.user
		});
	}
});

app.get('/addpoint', function(req, res) {
	Track.update({
		username: req.user.username
	}, {
		$push: {
			data: {
				date: req.query.date,
				miles: req.query.miles
			}
		},
		$setOnInsert: {
			username: req.user.username
		}
	}, {
		upsert: true
	}, function(err) {
		if (err) console.error(err);
		res.send('');
	});
});

app.get('/getpoints', function(req, res) {
	Track.findOne({
		username: req.user.username
	}, function(err, track) {
		if (err) console.error(err);
		var data = [];
		if (track) {
			for (var idx = 0; idx < track.data.length; ++idx) {
				var date = moment(track.data[idx].date).format('MM/DD/YYYY');
				console.log('date=' + date);
				data.push({ date: date, miles: track.data[idx].miles });
			}
		}
		res.send(data);
	});
});

app.get('/ajax', function(req, res) {
	res.render('ajax', {
		user: req.user
	});
});

app.get('/searching', function(req, res) {
	res.send("searched: " + req.query.search);
});

app.get('/login', function(req, res) {
	res.render('login', {
		user: req.user
	});
});

app.post('/login', passport.authenticate('local', {
	successRedirect: '/',
	failureRedirect: '/login',
	failureFlash: true
}));

app.get('/signup', function(req, res) {
	res.render('signup', {
		user: req.user
	});
});

app.post('/signup', function(req, res) {
	var user = new User({
		username: req.body.username,
		email: req.body.email,
		password: req.body.password
	});

	user.save(function(err) {
		req.logIn(user, function(err) {
			res.redirect('/');
		});
	});
});

app.get('/logout', function(req, res) {
	req.logout();
	res.redirect('/');
});

app.get('/forgot', function(req, res) {
	res.render('forgot', {
		user: req.user
	});
});

app.post('/forgot', function(req, res, next) {
	async.waterfall([
		function(done) {
			crypto.randomBytes(20, function(err, buf) {
				var token = buf.toString('hex');
				done(err, token);
			});
		},
		function(token, done) {
			User.findOne({
				email: req.body.email
			}, function(err, user) {
				if (!user) {
					req.flash('error', 'No account with that email address exists.');
					return res.redirect('/forgot');
				}

				user.resetPasswordToken = token;
				user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

				user.save(function(err) {
					done(err, token, user);
				});
			});
		},
		function(token, user, done) {
			var smtpTransport = nodemailer.createTransport({
				service: 'Gmail',
				auth: {
					user: 'codeturner',
					pass: 'kalstoble'
				}
			});
			var mailOptions = {
				to: user.email,
				from: 'passwordreset@demo.com',
				subject: 'Node.js Password Reset',
				text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
					'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
					'http://' + req.headers.host + '/reset/' + token + '\n\n' +
					'If you did not request this, please ignore this email and your password will remain unchanged.\n'
			};
			smtpTransport.sendMail(mailOptions, function(err) {
				req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
				done(err, 'done');
			});
		}
	], function(err) {
		if (err)
			return next(err);
		res.redirect('/forgot');
	});
});

app.get('/reset/:token', function(req, res) {
	User.findOne({
		resetPasswordToken: req.params.token,
		resetPasswordExpires: {
			$gt: Date.now()
		}
	}, function(err, user) {
		if (!user) {
			req.flash('error', 'Password reset token is invalid or has expired.');
			return res.redirect('/forgot');
		}
		res.render('reset', {
			user: req.user
		});
	});
});

app.post('/reset/:token', function(req, res) {
	async.waterfall([
		function(done) {
			User.findOne({
				resetPasswordToken: req.params.token,
				resetPasswordExpires: {
					$gt: Date.now()
				}
			}, function(err, user) {
				if (!user) {
					req.flash('error', 'Password reset token is invalid or has expired.');
					return res.redirect('back');
				}

				user.password = req.body.password;
				user.resetPasswordToken = undefined;
				user.resetPasswordExpires = undefined;

				user.save(function(err) {
					req.logIn(user, function(err) {
						done(err, user);
					});
				});
			});
		},
		function(user, done) {
			var smtpTransport = nodemailer.createTransport('SMTP', {
				service: 'SendGrid',
				auth: {
					user: '!!! YOUR SENDGRID USERNAME !!!',
					pass: '!!! YOUR SENDGRID PASSWORD !!!'
				}
			});
			var mailOptions = {
				to: user.email,
				from: 'passwordreset@demo.com',
				subject: 'Your password has been changed',
				text: 'Hello,\n\n' +
					'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
			};
			smtpTransport.sendMail(mailOptions, function(err) {
				req.flash('success', 'Success! Your password has been changed.');
				done(err);
			});
		}
	], function(err) {
		res.redirect('/');
	});
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use(function(err, req, res, next) {
		res.status(err.status || 500);
		res.render('error', {
			message: err.message,
			error: err
		});
	});
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: {}
	});
});

module.exports = app;
