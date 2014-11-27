var express = require('express');
var bodyparser = require('body-parser');
var nano = require('nano')('http://localhost:5984');

var router = express.Router();
var db = nano.use('address');

/* GET home page. */
router.get('/', function (req, res) {
	res.render('index', {
		title : 'Express'
	});
});

router.post('/new_contact', function (req, res) {
	var name = req.body.name;
	var phone = req.body.phone;
	/*The second parameter phone is the id we are explicitly specifying*/
	db.insert({
		name : name,
		phone : phone,
		crazy : true
	}, phone, function (err, body, header) {
		if (err) {
			res.send("Error creating contacts or contacts already exists");
			return;
		}
		res.send("Contact '" + name + "' was created successfully");
	});
});

router.post('/view_contact', function (req, res) {
	var alldoc = "Following are the Document <br/><br/>";
	db.get(req.body.phone, {
		revs_info : true
	}, function (err, body) {
		if (!err)
			console.log(body);
		if (body) {
			alldoc += "Name:" + body.name + "<br/> Phone :" + body.phone;
		} else {
			alldoc = "No Record exist with that key";
		}
		res.send(alldoc);
	});
});

router.post('/delete_contact', function (req, res) {
	db.get(req.body.phone, {
		revs_info : true
	}, function (err, body) {
		if (!err) {
			db.destroy(req.body.phone, body._rev, function (err, body) {
				if (!err) {
					res.send("Error in deleting");
				} else {}
			});
			res.send("Document deleted successfully");
		}
	});
});

router.get('/contacts', function (req, res) {
	db.list({include_docs : true}, function (err, body) {
		if (!err) {
			console.log(body.rows);
			res.render('contacts', {
				title : 'Contacts',
				contacts : body.rows
			});
		} else {
			res.send("Error get contact list");
		}
	});
});

module.exports = router;
