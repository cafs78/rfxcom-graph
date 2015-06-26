var express = require('express');
var router = express.Router();
var rfx = require('../lib/rfxcom-wrapper');
var sql = require('../lib/sqlite3-wrapper');

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
        //res.json(code, body);
    } else {
        res.status(code).end();
    }
};

/* GET users listing. */
router.get('/', function(req, res, next) {
    req.check('name', 'required').notEmpty();
    req.check('action', 'required').notEmpty();
    req.check('level', 'must be integer').optional().isInt();
    req.sanitize('action').ltrim('switch');
    req.check('action', 'can only be on off or level').matches(/\bon\b|\boff\b|\blevel\b/);
    var mappedErrors = req.validationErrors(true);
    if (mappedErrors) {
        send_response(req, res, mappedErrors, 400);
    } else {
        var action = req.query.action;
        var name = req.query.name;
        var level = req.query.level;

        if (action === 'level' && (level === undefined)) {
            send_response(req, res, { msg: 'Missing level parameter'}, 400);
        } else {
            sql.get_by_name_type(name, 'switch', function(err, dev) {
                if (err) {
                    send_response(req, res, { msg: 'Error retrieving device called ' + name}, 500);
                } else {
                    if (!dev) {
                        send_response(req, res, { msg: 'Cannot find any device called  ' + name}, 404);
                    } else {
                        var c;
                        switch (action) {
                            case 'on':
                                c = 'switchOn';
                                break;
                            case 'off':
                                c = 'switchOff';
                                break;
                            case 'level':
                                c = 'level';
                                break;
                        }
                        if (c === 'level') {
                            //rfx.command(dev, c, level, function() {
                                send_response(req, res, { msg: name + ' level set to ' + level}, 200);
                            //});
                        } else {
                            //rfx.command(dev, c, function() {
                                send_response(req, res, { msg: name + ' switched ' + action}, 200);
                            //});
                        }
                    }
                }
            });
        }
    }
});

module.exports = router;
