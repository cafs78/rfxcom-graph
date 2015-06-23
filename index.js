var fs = require('fs');
var util = require('util');
var rfx = require('./lib/rfxcom-wrapper');
var sql = require('./lib/sqlite3-wrapper');
var async = require('async');
var server = require('./lib/server');

var config;

function beginsWith(s, needle) {
    return(s.indexOf(needle) == 0);
}

function print_event(evt) {
    var type = rfx.get_type(evt.proto);
    if (beginsWith(evt.name, '0x')) {
        var d = {
            name : evt.name,
            proto : evt.proto,
            unit : evt.unit
        }

        console.log('Unhandle device: ' + JSON.stringify(d));
    } else {
        var t = new Date(evt.ts);
        var arr = [t.toLocaleString(), type, evt.name];
        switch (type) {
            case 'temp':
                arr.push('temperature:', evt.t, 'humidity:', evt.h, 'battery:', evt.b);
                break;
            case 'switch':
                arr.push('status:', evt.status, 'level:', evt.level);
                break;
        }

        console.log(arr.join(' '));
    }
}

function update(evt) {
    var old;
    var stage = 'none';
    async.waterfall(
        [
            function get_current(w_cb) {
                stage = 'get_current';
                sql.get_current(evt, w_cb);
            },
            function update_current(value, w_cb) {
                stage = 'update_current';
                if (!w_cb) {
                    w_cb = value;
                    w_cb();
                } else {
                    old = value;
                    sql.update_current(evt, value, w_cb)
                }
            },
            function insert_log(w_cb) {
                stage = 'insert_log';
                if (old) {
                    sql.insert_log(evt, old, w_cb);
                } else {
                    w_cb();
                }
            }
        ], function(err) {
            if (err) {
                console.error('Error updating device at %s stage %s -> %s', stage, err,  util.inspect(evt));
            }
        }
    );
}

try {
    var config_file = fs.readFileSync('./config.json');
    config = JSON.parse(config_file);
} catch (e) {
    console.error('Error reading config file: ' + e);
    process.exit(-1);
}

console.log('Config file: ' + util.inspect(config));
console.log('Creating object to host all devices');

rfx.on('temp', function(evt) {
    print_event(evt);
    update(evt);
});

rfx.on('switch', function(evt) {
    print_event(evt);
    update(evt);
});

process.once('SIGQUIT', function() {
    rfx.close();
    sql.close(function(err) {
        var code = 0;
        if (err) {
            console.error('There was an error when closing db: %s', err);
            code = 1;
        } else {
            console.log('System properly closed');
        }

        setTimeout(function() {
            process.exit(code);
        }, 10000);
    });
});

function update_all(olds, cb) {
    var it = function(el, cb_it) {
        sql.get_last(el, function(err, row) {
            if (err || !row) {
                cb_it(err);
            } else {
                sql.update_current(row, el, cb_it);
            }
        });
    }

    async.eachSeries(olds, it, cb);
}

var self = this;
var stage = 'none';
var olds;
async.waterfall(
    [
        function create_in_memo_db(w_cb) {
            stage = 'create_in_memo_db';
            sql.init_memo(config.devices, config.ignored, w_cb);
        },
        function create_logs_db(w_cb) {
           stage = 'create_in_memo_db';
           sql.init_logs(w_cb);
        },
        function get_currents(w_cb) {
            stage = 'get_currents';
            sql.get_devices(true, w_cb);
        },
        function update_all_old(rows, w_cb) {
            stage = 'update_all';
            olds = rows;
            update_all(olds, w_cb);
        },
    ], function(err) {
        if (err) {
            console.error('There was an error at %s stage: %s', stage, err);
        } else {
            rfx.init(config.RfxCom.path, config.RfxCom.options, config.devices, config.ignored, function() {
                console.log('rfx initialized');
                server.start();
            });
        }
    }
);


