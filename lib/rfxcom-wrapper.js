var rfxcom = require('rfxcom');
var util = require('util');
var EventEmitter = require("events").EventEmitter;

/*
 * [0] : protocol name
 * [1] : device type (event we will emit to listeners)
 *   'sec' - security
 *   'temp' - temperature
 *   'switch' - switches
 *   'sensor' - sensor
 */
var protocols = [
    [ 'security1', 'sec' ],
    [ 'elec', 'switch' ],
    [ 'lighting5', 'switch' ],
    [ 'lighting2', 'switch' ],
    [ 'lighting1', 'switch' ],
    [ 'rfxsensor', 'sensor' ],
    [ 'th1', 'temp' ],
    [ 'th2', 'temp' ],
    [ 'temp1', 'temp' ],
    [ 'temp2', 'temp' ]
];

/* will create events to be consume by listeners
 *      temp: {
            ts: timestamp,
            name: name of device,
            id: id of device in RF protocol
            t: temperature
            h: humidity,
            b: battery,
            proto: Radio protocol
        }

        switch: {
            ts: timestamp,
            name: name of device,
            id: id of device in RF protocol,
            unit: unit code of device;
            level: level if dimmer event,
            status: on/off,
            proto: Radio Protocol
        }
 */
function create_event(type, evt, dev) {
    var r = {
        ts : Date.now(),
        name : dev.name,
        id : evt.id,
        proto : dev.proto
    };

    switch (type) {
        case 'temp':
            r.t = evt.temperature;
            r.h = evt.humidity;
            r.b = evt.batteryLevel;
            break;
        case 'switch':
            r.unit = evt.unitcode;
            r.level = evt.level;
            r.status = evt.command;
            break;
    }

    return r;
}

function create_fake_event(command, dev, level) {
    var evt = {
        unitcode : dev.unit
    }

    switch (command) {
        case 'switchOn':
            evt.level = 15;
            evt.command = 'On';
            break;
        case 'switchOff':
            evt.level = 0;
            evt.command = 'Off';
            break;
        case 'setLevel':
            evt.level = level;
            evt.command = (level === 0) ? 'Off' : 'On';
            break;
    }

    return create_event('switch', evt, dev);
}

function Rfxcom() {
}

util.inherits(Rfxcom, EventEmitter);

Rfxcom.prototype.open = function(dev, options) {
    if (!this.rfx) {
        //var rfxtrx = new rfxcom.RfxCom('/dev/ttyUSB0', {debug: true});
        this.rfx = new rfxcom.RfxCom(dev, options);
    }
};

// Will configure the events listeners for devices
Rfxcom.prototype.listen = function(devices, ignored) {
    var rfx = this.rfx;
    if (!rfx) {
        this.open(this.dev, this.options);
    }

    var self = this;
    rfx.removeAllListeners();
    protocols.forEach(function(el) {
        console.log('Adding listener for ' + el[1]);
        rfx.on(el[0], function(evt) {
            self.process_event(el[0], el[1], evt, devices, ignored);
        });
    });
};

// Will configure the events listeners for devices
Rfxcom.prototype.close = function() {
    this.rfx.removeAllListeners();
};

/*
 * Receive a events from proto, type and must decide if we have to emit a new event
 * or not depending on devices and ignored
 */
Rfxcom.prototype.process_event= function(proto, type, evt, devices, ignored) {
    function filter_func(el) {
        switch (proto) {
            case 'lighting2':
                return ((el.proto === proto) &&
                        (el.id === evt.id) &&
                        (el.unit === evt.unitcode));
            case 'th1':
            case 'th2':
            case 'temp1':
            case 'temp2':
                return ((el.proto === proto) && (el.id === evt.id));
            default:
                return false;
        }
    }

    var no;
    var yes = devices.filter(filter_func);
    if (yes.length === 0) {
        no = ignored.filter(filter_func);
        if (no.length === 0) {
            var dev = {
                name : evt.id,
                proto : proto
            }

            if (this.options.debug) {
                console.log(util.inspect(evt));
            }

            this.emit(type, create_event(type, evt, dev));
        } else {
            // it is an ignored device
            if (no[0].debug) {
                console.log('Ignore device: ' + util.inspect(no));
            }
        }
    } else if (yes.length === 1) {
        // it is a handled device
        var dev = yes[0];
        if (dev.debug) {
            console.log(util.inspect(evt));
        }
        this.emit(type, create_event(type, evt, dev));
    } else {
        console.error('There was an error, mor than 1 matchd devices: ' + util.inspect(yes));
    }
};

Rfxcom.prototype.init = function(dev, options, devices, ignored, cb) {
    this.dev = dev;
    this.options = options;

    this.open(dev, options);
    this.listen(devices, ignored);

    var rfx = this.rfx;
    rfx.initialise(function() {
        console.log('Device initialised');
        cb();
    });
}

/*
 * Send command to a device
 *
 */
Rfxcom.prototype.command = function(dev, command, level, cb) {
    var rfx = this.rfx;
    if (typeof command === 'number') {
        cb = level;
        level = command;
        command = undefined;
    } else if (typeof level === 'function') {
        cb = level;
        level = undefined;
    }

    switch (dev.proto) {
        case 'lighting2':
            var id = [ dev.id, dev.unit ].join('/');
            lighting2 = new rfxcom.Lighting2(rfx, rfxcom.lighting2.AC);
            var self = this;
            if (command && lighting2[command]) {
                lighting2[command](id, function() {
                    console.log([ dev.name, '- Command', command, 'sent to', id].join(' '));
                    self.emit('switch', create_fake_event(command, dev));
                    cb();
                });
            } else {
                lighting2.setLevel(id, level, function() {
                    console.log([ dev.name, '- Level set to ', level, 'id:', id ].join(' '));
                    self.emit('switch', create_fake_event('setLevel', dev, level));
                    cb();
                });
            }

            break;
    }
};

/*
 * Will tell the type of protocol
 */
Rfxcom.prototype.get_type = function(proto) {
    var r_value;
    protocols.some(function(el){
        if (el[0] === proto) {
            r_value = el[1];
            return true;
        } else {
            return false;
        }
    });

    return r_value;
 };

module.exports = new Rfxcom();

