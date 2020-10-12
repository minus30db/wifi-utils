const args = process.argv;

// console.log(args);

const WiFiUtils = require('./lib/wifi-utils');

const wifiUtils = new WiFiUtils();


wifiUtils.on('stdout', message => console.log(message));
wifiUtils.on('stderr', message => console.log(message));
wifiUtils.on('error', resp => {
    console.log(resp.message);
    console.log(resp.err);
});

wifiUtils.on('ready', () => {
    const command = actions[args[2] ? args[2] : 'save'];
    if ( typeof actions[args[2]] === 'function' ) {
        command(args[3] ? args[3] : null, args[4] ? args[4] : null);
    } else {
        console.log(`Command "${args[2]}" is not a valid command`);
    }
});



const actions = {
    save: function () {
        let savedCount = 0;
        wifiUtils.on('saved', message => {
            savedCount += 1;
            console.log(message)
        });
        let ignoredCount = 0;
        wifiUtils.on('ignored', () => ignoredCount += 1);
        // wifiUtils.on('doneSaving', () => {
        //     console.log(`Finished saving profiles. \n${savedCount} profiles saved \n${ignoredCount} profiles skipped.`);
        // })
        // wifiUtils.on('ignored', message => console.log(message));
        wifiUtils.saveProfiles();
    },
    removeauto: function () {
        wifiUtils.on('removed', message => console.log(message));
        wifiUtils.removeAutoFromHead();
    },
    find: function (search) {
        wifiUtils.find(search);

    },
    newwifi: function (ssid, password) {
        wifiUtils.newWifi(ssid, password);

    },
    show: function (options) {
        wifiUtils.show(options);
    },
    config: function () {
        wifiUtils.config();
    },
    restore: function (index) {
        wifiUtils.restore(index);
    }
}


wifiUtils.init();