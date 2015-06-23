var fs = require('fs');
var util = require('util');
var rfx = require('./lib/rfxcom-wrapper');

var config;

function beginsWith(s, needle) {
    return(s.indexOf(needle) == 0);
}

function print_event(type, evt) {
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

try {
    var config_file = fs.readFileSync('./config.json');
    config = JSON.parse(config_file);
} catch (e) {
    console.error('Error reading config file: ' + e);
    process.exit(-1);
}

console.log('Config file: ' + util.inspect(config));

rfx.on('temp', function(evt) {
    print_event('temp', evt);
});

rfx.on('switch', function(evt) {
    print_event('switch', evt);
});


var lampara =  {
    name: 'lampara',
    proto: 'lighting2',
    id: '0x007804CA',
    unit: 3
};

rfx.init(config.RfxCom.path, config.RfxCom.options, config.devices, config.ignored, function() {
    console.log('Wrapper initiated and waiting for events');
    rfx.command(lampara, 'switchOn', function() {
        setTimeout(function() {
            rfx.command(lampara, 'switchOff', function() {
                console.log('Ale');
            });
        }, 5000);
    })
});


