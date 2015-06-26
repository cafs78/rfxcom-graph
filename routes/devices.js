var express = require('express');
var router = express.Router();
var rfx = require('../lib/rfxcom-wrapper');
var sql = require('../lib/sqlite3-wrapper');
var util = require('util');
var async = require('async')
;
/**
 * Sends a HTTP response indicating a terminal has
 * not been found
 * @param req Request object
 * @param res Response object
 */
var send_response = function(req, res, body, code) {
    var body_type = typeof body;
    code = code || 200;
    if (body_type === 'string') {
        res.writeHead(code, { 'Content-Type' : 'text/plain' });
        res.end(body);
    } else if (body_type === 'object') {
        body.code = code;
        res.status(code).json(body);
    } else {
        res.status(code).end();
    }
};

/* GET users listing. */
router.get('/', function(req, res, next) {
    async.series(
        [
            function get_temp(cb) {
                sql.get_fields_by_type(['name', 'ts', 't', 'h'], 'temp', cb);
            },
            function get_switches(cb) {
                sql.get_fields_by_type(['name', 'ts', 'status', 'level'], 'switch', cb);
            }
        ],function(err, results) {
            if (err) {
                send_response(req, res, { msg: 'Error retrieving devices data'}, 500);
            } else {
                var j = { title: 'Devices', temp : results[0], switches : results[1] };
                j.temp.forEach(function(el) {
                    var d = new Date();
                    d.setTime(el.ts);
                    el.ts = d.toLocaleString();
                });

                j.switches.forEach(function(el) {
                    var d = new Date();
                    d.setTime(el.ts);
                    el.ts = d.toLocaleString();
                });

                res.render('devices', j);
            }
        }
    );
});

module.exports = router;
