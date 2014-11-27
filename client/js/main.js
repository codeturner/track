var directionsService;
var directionsDisplay;
var map;
var markers = [];
var totalRoute;

function initialize() {
    var center = new google.maps.LatLng(37.6, -95.665);
    var mapOptions = {
        zoom: 4,
        center: center
    }
    map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

    directionsService = new google.maps.DirectionsService();

    var icon = {
        anchor: new google.maps.Point(8, 8),
        scaledSize: new google.maps.Size(16, 16),
        url: 'https://maps.gstatic.com/tactile/directions/text_mode/waypoint-last-2x.png'
    };

    directionsDisplay = new google.maps.DirectionsRenderer({
        map: map,
        markerOptions: {
            icon: icon
        }
    });

    var request = {
        origin: "47.6203394,-122.3492258",
        destination: "40.689233,-74.044522",
        provideRouteAlternatives: false,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL
    };
    directionsService.route(request, function(result, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsDisplay.setDirections(result);
            if (result.routes.length) {
                var rt = result.routes[0];
                if (rt.legs.length) {
                    var leg = rt.legs[0];
                    totalRoute = meter2mile(leg.distance.value);
                }
            }

            renderPoints();
        }
    });

    $('#map-add-button').click(addPoint);
}

function dist2pts(latlng1, latlng2) {
    var R = 6371000; // Radius of the earth in m
    var dLat = deg2rad(latlng2.lat() - latlng1.lat());
    var dLng = deg2rad(latlng2.lng() - latlng1.lng());
    var lat1 = deg2rad(latlng1.lat());
    var lat2 = deg2rad(latlng2.lat());
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

function bearing2pts(latlng1, latlng2) {
    var R = 6371000; // Radius of the earth in m
    var dLat = deg2rad(latlng2.lat() - latlng1.lat());
    var dLng = deg2rad(latlng2.lng() - latlng1.lng());
    var lat1 = deg2rad(latlng1.lat());
    var lat2 = deg2rad(latlng2.lat());
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return Math.atan2(y, x);
}

function destination(latlng, bearing, dist) {
    var R = 6371000; // Radius of the earth in m
    var lat1 = deg2rad(latlng.lat());
    var lng1 = deg2rad(latlng.lng());
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) + Math.cos(lat1) * Math.sin(dist / R) * Math.cos(bearing));
    var lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(dist / R) * Math.cos(lat1), Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2));
    return new google.maps.LatLng(rad2deg(lat2), rad2deg(lng2));
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

function rad2deg(rad) {
    return rad * (180 / Math.PI)
}

function mile2meter(mile) {
    return mile * 1609.344;
}

function meter2mile(meter) {
    return Math.floor(meter / 1609.344);
}

function calculateDistance(target) {
    var result = directionsDisplay.getDirections();
    var total = 0;

    if (result.routes.length) {
        var rt = result.routes[0];
        if (rt.legs.length) {
            var leg = rt.legs[0];
            for (var stepIdx = 0; stepIdx < leg.steps.length; stepIdx++) {
                var step = leg.steps[stepIdx];
                if (total + step.distance.value > target) {
                    var last;
                    for (var ptIdx = 0; ptIdx < step.path.length; ptIdx++) {
                        var pt = step.path[ptIdx];
                        if (!last) {
                            last = pt;
                        }
                        else {
                            var cur = pt;
                            var dist = dist2pts(last, cur);
                            if (total + dist > target) {
                                var bearing = bearing2pts(last, cur);
                                return destination(last, bearing, target - total);
                            }
                            total = total + dist;
                            last = cur;
                        }
                    }
                    return last; // should never get here
                }
                total = total + step.distance.value;
            }
            return leg.end_location;
        }
    }
}

function showPoints() {
    var marker = new google.maps.Marker({
        title: 'Current Position'
    });
    var icon = {
        anchor: new google.maps.Point(4, 4),
        scaledSize: new google.maps.Size(8, 8),
        url: 'https://maps.gstatic.com/intl/en_ALL/mapfiles/markers2/measle.png'
    };

    // clear existing markers
    for (var idx = 0; idx < markers.length; ++idx) {
        markers[idx].setMap(null);
    }

    markers = [];

    // add new markers
    var totalMiles = 0;
    $('#map-miles tbody tr').each(function() {
        var row = $(this);
        totalMiles = totalMiles + row.data('miles');
        markers.push(new google.maps.Marker({
            title: row.data('date'),
            map: map,
            position: calculateDistance(mile2meter(totalMiles)),
            icon: icon
        }));
    });

    $('#map-total-route').text(totalRoute);
    $('#map-so-far').text(totalMiles);
    $('#map-to-go').text(totalRoute - totalMiles);

    if (markers.length > 0) {
        var last = markers[markers.length - 1];
        markers.push(new google.maps.Marker({
            title: 'Current',
            map: map,
            animation: google.maps.Animation.DROP,
            position: last.position
        }));
    }
}

google.maps.event.addDomListener(window, 'load', initialize);

function addPoint() {
    var date = $('#map-add-date').val();
    var miles = $('#map-add-miles').val();
    if (date && miles) {
        $.get('/addpoint', {
            date: date,
            miles: miles
        }, function(data) {
            renderPoints();
            $('#map-add-date').val('');
            $('#map-add-miles').val('');
        });
    }
}

function renderPoints() {
    $.get('/getpoints', function(data) {
        var body = $('<tbody></tbody>');
        for (var idx = 0; idx < data.length; idx++) {
            var row = data[idx];
            var tr = $('<tr data-date="' + row.date + '" data-miles="' + row.miles + '"></tr>');
            tr.append('<td>' + $.datepicker.formatDate("mm/dd/yy", new Date(row.date)) + '</td>');
            tr.append('<td>' + row.miles + ' miles</td>');
            body.append(tr);
        }
        $('#map-miles tbody').html(body.html());
        showPoints();
    });
}
