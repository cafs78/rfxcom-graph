var sqlite3 = require('sqlite3');
var async = require('async');
var rfx = require('./rfxcom-wrapper');
var util = require('util');

var p_k_temp_m = ', PRIMARY KEY (id, proto)';
var p_k_temp_l = ', PRIMARY KEY (ts, id, proto)';
var qs_c_temp = [
    'CREATE TABLE IF NOT EXISTS temp (',
    'name TEXT,',
    'id TEXT NOT NULL,',
    'proto TEXT NOT NULL,',
    'ts INTEGER,',
    't INTEGER,',
    'h INTEGER,',
    'prev_ts INTEGER,',
    'prev_t INTEGER,',
    'prev_h INTEGER,',
    'enabled INTEGER'
];

var p_k_switch_m = ', PRIMARY KEY (id, proto, unit)';
var p_k_switch_l = ', PRIMARY KEY (ts, id, proto, unit)';
var qs_c_switch = [
    'CREATE TABLE IF NOT EXISTS switch (',
    'name TEXT,',
    'id TEXT NOT NULL,',
    'proto TEXT NOT NULL,',
    'unit INTEGER NOT NULL,',
    'ts INTEGER,',
    'status TEXT,',
    'level INTEGER,',
    'prev_ts INTEGER,',
    'prev_status TEXT,',
    'prev_level INTEGER,',
    'enabled INTEGER',
];

var qs_i_l_temp  = [
    'INSERT INTO temp',
    '(name, id, proto, ts, t, h, prev_ts, prev_t, prev_h) ',
    'VALUES($name, $id, $proto, $ts, $t, $h, $prev_ts, $prev_t, $prev_h);'
].join('');

var qs_i_l_switch  = [
    'INSERT INTO switch',
    '(name, id, proto, unit, ts, status, level, prev_ts, prev_status, prev_level) ',
    'VALUES($name, $id, $proto, $unit, $ts, $status, $level, $prev_ts, $prev_status, $prev_level);'
].join('');

function beginsWith(s, needle) {
    return(s.indexOf(needle) == 0);
}

function Sqlite3() {
    this.memo_ready = false;
    this.logs_ready = false;
}

/**
 * Will initializa memory db object
 */
Sqlite3.prototype.init_memo = function (dev, ignore, cb) {
    if (!this.memory && !this.memo_ready) {
        var self = this;
        async.series(
            [
            function memory_db(s_cb) {
                self.memory = new sqlite3.Database(':memory:', function(err) {
                    if (err) {
                        console.error('There was an error creating memmory db: ' + err);
                    }

                    s_cb(err);
                });
            },
            function create_memo_tables(s_cb) {
                self.create_memo(dev, ignore, s_cb);
            }
            ], function(err) {
                if (err) {
                    self.memory = undefined;
                    self.memo_ready = false;
                } else {
                    self.memo_ready = true;
                }

                cb(err);
            }
        );
    } else {
        var msg = 'Cannot intialise more than once db';
        console.error(msg);
        cb(new Error(msg));
    }
};

/**
 * Will initializa memory db object
 */
Sqlite3.prototype.init_logs = function (cb) {
    if (!this.logs && !this.logs_ready) {
        var self = this;
        async.series(
            [
            function logs_db(s_cb) {
                self.logs = new sqlite3.Database(__dirname + '/../logs.db', function(err) {
                    if (err) {
                        console.error('There was an error creating logs db: ' + err);
                    }

                    s_cb(err);
                });
            },
            function create_logs_tables(s_cb) {
                self.create_logs(s_cb);
            }
            ], function(err) {
                if (err) {
                    self.logs = undefined;
                    self.logs_ready = false;
                    cb(err);
                } else {
                    self.logs_ready = true;
                    cb();
                }
            }
        );
    } else {
        var msg = 'Cannot intialise more than once db';
        console.error(msg);
        cb(new Error(msg));
    }
};

/**
 * Will receive 2 arrays of devices (devices, ignore) and will create 2 tables:
 *  - temp: name, id, proto, ts, t, h, prev_ts, prev_t, prev_h, enabled
 *  - switch: name, id, unit, proto, ts, status, level, prev_ts, prev_status, prev_level
 */
Sqlite3.prototype.create_memo = function(dev, ignore, cb) {
    var self = this;
    var memory = this.memory;
    var stage = 'none';
    /* Insert device into its table */
    var insert_dev = function(el, cb) {
        var table = rfx.get_type(el.proto);
        var values = {
            $name: el.name,
            $id: el.id,
            $proto: el.proto
        };

        if (!el.name || beginsWith(el.name, '0x')) {
            values.$enabled = 0;
        } else {
            values.$enabled = 1;
        }

        var qs;
        switch (table) {
            case 'temp':
                qs = [
                    'INSERT INTO ',
                    table,
                    '(name, id, proto, enabled) ',
                    'values($name, $id, $proto, $enabled);'
                ].join('');
                break;
            case 'switch':
                values.$unit = el.unit;
                qs = [
                    'INSERT INTO ',
                    table,
                    '(name, id, proto, unit, enabled) ',
                    'values($name, $id, $proto, $unit, $enabled);'
                ].join('');
                break;
        }

        memory.run(qs, values, function(err) {
            if (err) {
                console.error('Error running query "%s" with values "%s"', err, util.inspect(values));
            } else {
                console.log('Inserted %s', this.lastID);
            }

            cb(err);
        });
    };

    var q;
    async.series(
        [
            function delete_devices_temp(s_cb) {
                stage = 'drop_temp';
                memory.run('DROP TABLE IF EXISTS temp;', s_cb);
            },
            function delete_devices_switch(s_cb) {
                stage = 'drop_switch';
                memory.run('DROP TABLE IF EXISTS switch;', s_cb);
            },
            function create_devices_temp(s_cb) {
                stage = 'create_temp';
                q = qs_c_temp.concat(p_k_temp_m, ');');
                memory.run(q.join(' '), s_cb);
            },
            function create_devices_switch(s_cb) {
                stage = 'create_switch';
                q = qs_c_switch.concat(p_k_switch_m, ');');
                memory.run(q.join(' '), s_cb);
            },
            function process_dev_array(s_cb) {
                stage = 'insert_dev';
                async.eachSeries(dev, insert_dev, s_cb);
            },
            function process_ignore_array(s_cb) {
                stage = 'insert_ignore';
                async.eachSeries(ignore, insert_dev, s_cb);
            }
        ],
        function(err, results) {
            if (err) {
                console.error('there was an error at %s stage: %s - query %s', stage, err, q.join(' '));
            } else {
                console.log('Memory database created properly');
            }

            cb(err);
        }
    );
};

/**
 * will create 2 tables:
 *  - temp: name, id, proto, ts, t, h, prev_ts, prev_t, prev_h, enabled
 *  - switch: name, id, unit, proto, ts, status, level, prev_ts, prev_status, prev_level
 */
Sqlite3.prototype.create_logs = function(cb) {
    var self = this;
    var logs = this.logs;
    var stage = 'none';

    async.series(
        [
            function create_devices_temp(s_cb) {
                stage = 'create_temp';
                q = qs_c_temp.concat(p_k_temp_l, ');');
                logs.run(q.join(' '), s_cb);
            },
            function create_devices_switch(s_cb) {
                stage = 'create_switch';
                q = qs_c_switch.concat(p_k_switch_l, ');');
                logs.run(q.join(' '), s_cb);
            },
        ],
        function(err, results) {
            if (err) {
                console.error('there was an error at %s stage: %s', stage, err)
            } else {
                console.log('logs database created properly');
            }

            cb(err);
        }
    );
};

/* Insert a log line */
Sqlite3.prototype.insert_log = function(current, old, cb) {
    var logs = this.logs;
    var type = rfx.get_type(current.proto);
    var values = {
        $name: current.name,
        $id: current.id,
        $proto: current.proto,
        $ts: current.ts,
        $prev_ts: old.ts
    };

    var qs;
    switch (type) {
        case 'temp':
            values.$t = current.t;
            values.$h = current.h;
            values.$prev_t = old.t;
            values.$prev_h = old.h;
            qs = qs_i_l_temp;
            break;
        case 'switch':
            values.$unit = current.unit;
            values.$status = current.status;
            values.$level = current.level;
            values.$prev_status = old.status;
            values.$prev_level = old.level;
            qs = qs_i_l_switch;
            break;
    }

    logs.run(qs, values, function(err) {
        if (err) {
            console.error('Error running query "%s" with values "%s"', err, util.inspect(values));
        } else {
            console.log('Inserted %s', this.lastID);
        }

        cb(err);
    });
};

/* get devices data depending on enabled field */
Sqlite3.prototype.get_devices = function(enabled, cb) {
    var memory = this.memory;
    var qs_switch = 'SELECT * FROM switch WHERE enabled = ?;';
    var qs_temp = 'SELECT * FROM temp WHERE enabled = ?;';
    var en = enabled ? 1 : 0;
    var stage = 'none';
    async.series(
        [
            function get_temp(s_cb) {
                stage = 'get_temp';
                memory.all(qs_switch, en, s_cb);
            },
            function get_switch(s_cb) {
                stage = 'get_switch';
                memory.all(qs_temp, en, s_cb);
            }
        ],
        function(err, results) {
            if (err) {
                console.error('Error retrieving devices enabled = ' + enabled);
                cb(err);
            } else {
                var arr = results[0].concat(results[1]);
                cb(null, arr);
            }
        }
    );
};

/* get current device info */
Sqlite3.prototype.get_current = function(dev, cb) {
    var memory = this.memory;
    var type = rfx.get_type(dev.proto);
    var values = {
        $name : dev.name,
        $id : dev.id,
        $proto: dev.proto
    };

    var qs;
    switch (type) {
        case 'temp':
            qs  = [
                'SELECT name, id, proto, ts, t, h, prev_ts, prev_t, prev_h FROM temp WHERE ',
                'name = $name AND id = $id AND proto = $proto AND enabled = 1;'
            ].join('');
            break;
        case 'switch':
            qs = [
                'SELECT name, id, unit, proto, ts, status, level, prev_ts, prev_status, prev_level ',
                'FROM switch WHERE ',
                'name = $name AND id = $id AND unit = $unit AND proto = $proto AND enabled = 1;'
            ].join('');
            values.$unit = dev.unit;
            break;
    };

    memory.get(qs, values, cb);
};

/* get last logs */
Sqlite3.prototype.get_last = function(dev, cb) {
    var logs = this.logs;
    var type = rfx.get_type(dev.proto);
    var values = {
        $name : dev.name,
        $id : dev.id,
        $proto: dev.proto,
    };

    var qs;
    switch (type) {
        case 'temp':
            qs  = [
                'SELECT * FROM temp WHERE ',
                'name = $name AND id = $id AND proto = $proto ORDER BY ts DESC LIMIT 1;'
            ].join('');
            break;
        case 'switch':
            qs = [
                'SELECT * FROM switch WHERE ',
                'name = $name AND id = $id AND unit = $unit AND proto = $proto ORDER BY ts DESC LIMIT 1;'
            ].join('');
            values.$unit = dev.unit;
            break;
    };

    logs.get(qs, values, cb);
};

/* update current device info */
Sqlite3.prototype.update_current = function(dev, old, cb) {
    var memory = this.memory;
    var type = rfx.get_type(dev.proto);
    var values = {
        $name : dev.name,
        $id : dev.id,
        $proto: dev.proto,
        $ts: dev.ts,
        $prev_ts: old.ts
    };

    var qs;
    switch (type) {
        case 'temp':
            qs  = [
                'UPDATE temp SET ',
                'ts = $ts, t = $t, h = $h, prev_ts = $prev_ts, prev_t = $prev_t, prev_h = $prev_h WHERE ',
                'name = $name AND id = $id AND proto = $proto;'
            ].join('');
            values.$t = dev.t;
            values.$h = dev.h;
            values.$prev_t = old.t;
            values.$prev_h = old.h;
            break;
        case 'switch':
            qs = [
                'UPDATE switch SET ',
                'ts = $ts, status = $status, level = $level, prev_ts = $prev_ts, ',
                'prev_status = $prev_status, prev_level = $prev_level WHERE ',
                'name = $name AND id = $id AND unit = $unit AND proto = $proto;'
            ].join('');
            values.$unit = dev.unit;
            values.$status = dev.status;
            values.$level = dev.level;
            values.$prev_status = old.status;
            values.$prev_level = old.level;
            break;
    };

    memory.run(qs, values, cb);
};

/* Get back all devices and close database */
Sqlite3.prototype.close = function(cb) {
    var memory = this.memory;
    var logs = this.logs;
    if (memory && this.memo_ready) {
        var devices;
        var ignored;
        var self = this;
        var stage = 'none';
        async.series(
            [
                function get_active(s_cb) {
                    stage = 'get_active';
                    self.get_devices(true, s_cb);
                },
                function get_ignored(s_cb) {
                    stage = 'get_ignored';
                    self.get_devices(false, s_cb);
                },
                function close_memo(s_cb){
                    stage = 'close_memo';
                    memory.close(s_cb);
                },
                function close_logs(s_cb){
                    stage = 'close_memo';
                    logs.close(s_cb);
                }
            ],
            function(err, results) {
                if (err) {
                    console.error('There was an error at stage %s : %s', stage, err);
                    cb(err);
                } else {
                    self.memory = undefined;
                    self.memo_ready = false;
                    cb(undefined, results[0], results[1]);
                }
            }
        );
    } else {
        cb(new Error('Cannot delete memo db if it wasn\'t created before'));
    }
};

Sqlite3.prototype.get_by_name_type = function(name, type, cb) {
    var memory = this.memory;
    var qs = [ 'SELECT * FROM', type, 'WHERE name = ? AND enabled = 1;' ];
    memory.get(qs.join(' '), name, cb);
};

module.exports = new Sqlite3();

