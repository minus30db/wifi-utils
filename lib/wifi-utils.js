const homedir = require('os').homedir,
    fs = require('fs'),
    cp = require('child_process'),
    path = require('path'),
    { prompt } = require('inquirer'),
    EventEmitter = require('events').EventEmitter;

// Config questions
const configQuestions = [
    {
        type: 'input',
        name: 'backupDir',
        message: 'Enter an existing folder name in your home Directory (ie.: Documents or Documents/Backups)'
    },
    {
        type: 'input',
        name: 'backupFile',
        message: 'Enter a name for the backup file (ie.: WiFi-Backup.txt)'
    }
];


class WiFiUtils extends EventEmitter {
    constructor() {
        super();
        this.bkupFd = null;
        this.params = null;
        this.backupDocText = null;
    }

    init() {
        try {
            this.params = require('../.data/config.json');
            this.emit('ready');
        } catch (err) {
            prompt(configQuestions).then(answers => {
                const fd = fs.openSync(path.join(__dirname, '../.data/config.json'), 'a+');
                fs.writeSync(fd, JSON.stringify(answers, null, 4));
                this.params = answers;
                fs.close(fd);
                this.emit('ready');
            });

        }

    }

    saveProfiles() {
        this._openBackupFile(this.params);
        let mappedDocument = mapDocument(this.backupDocText);
        // Get all the names of the wifi profiles from network manager
        // fs.readdir(`/etc/NetworkManager/system-connections`, (err, files) => {
        cp.exec('nmcli -t c s', (err, stdout, stderr) => {
            if (err) throw err;
            let profiles = parseConnList(stdout);
            // Itterate through the names
            profiles.forEach((profile, i) => {
                this._addProileToDocument(profile, mappedDocument, actionPerformed => {
                    if (actionPerformed) {
                        this.emit('saved', actionPerformed);
                    }
                });
            });
            this.emit('doneSaving');
        });

        function parseConnList(stdout) {
            let parsed = stdout.split('\n')
                .map(line => {
                    let vals = line.split(':');
                    return {
                        name: vals[0],
                        uuid: vals[1],
                        type: vals[2],
                        iface: vals[3] ? vals[3] : null
                    };
                }).filter(conn => {
                    return conn.type === '802-11-wireless'
                }).map(conn => {
                    try {
                        // console.log(conn);
                        const command = `nmcli -t -f 802-11-wireless.ssid,802-11-wireless-security.psk -s c s`;
                        conn.details = cp.execSync(`${command} "${conn.name}"`, { encoding: "utf-8" })
                        if (conn.details !== '') {
                            conn.ssid = conn.details
                                .split('\n')[0]
                                .split(':')[1];
                            conn.pass = conn.details
                                .split('\n')[1]
                                .split(':')[1];
                        }
                        return {
                            uuid: conn.uuid,
                            name: conn.name,
                            ssid: conn.ssid,
                            pass: conn.pass
                        };
                    } catch (err) {
                        console.log(conn);
                        throw err;
                    }
                });
            return parsed;
        }
        function mapDocument(doc) {

            try {
                let lines = doc.split('\n');
                let mapped = lines
                    .map(line => {
                        try {
                            let parsed = JSON.parse(line);
                            return parsed;
                        } catch(err) {
                            return {uuid: null};
                        }
                    });
                return mapped;
            } catch (err) {
                return null;
            }
        }
    }

    removeAutoFromHead() {
        cp.exec('nmcli -f name c s', (err, stdout, stderr) => {
            if (err) {
                this.emit('error', {
                    message: 'Error retriving list of connections',
                    err: err
                });
            } else {
                const lines = stdout.split('\n')
                const connections = lines.slice(1, lines.length - 1);
                connections.forEach(conn => {
                    conn = conn.trim();
                    const match = conn.match(/^Auto\s/);
                    if (match) {
                        const newConName = conn.replace(/^Auto\s/, '');
                        cp.exec(`nmcli con mod "${conn}" con-name "${newConName}"`, (err, stdout, stderr) => {
                            if (err) {
                                this.emit('error', {
                                    message: `Error removing Auto from profile name: ${conn}`,
                                    error: err
                                });
                            } else {
                                this.emit('removed', `Auto removed from head of profile name: ${newConName}`)
                            }
                        });
                    }
                })
            }
        })
    }

    find(search) {
        let profiles = this._indexProfiles();
        // Filter profiles 
        if (search === null) {
            console.log(profiles)
        } else {
            let searchResults = profiles
                .filter(obj => {
                    let string = JSON.stringify(obj);
                    let match = string.match(new RegExp(search,'i'));
                    if (match) { return true; }
                });
            console.log(searchResults);
        }
    }

    restore(index) {
        // index = typeof index === 'number' ? index : Number(index);
        // Index profiles from files
        let thisProfile = this._indexProfiles()
            // Filter for profile by index
            .filter(obj => obj.index === index);
        
        thisProfile = thisProfile.length > 0 ? thisProfile[0] : null;
        this.newWifi(thisProfile.name, thisProfile.pass);
    }

    newWifi(ssid, password, conName) {
        conName = conName === undefined ? ssid : conName;
        let command = `nmcli con add type wifi ifname wlo1 con-name "${conName}" ssid "${ssid}" 802-11-wireless-security.psk "${password}" 802-11-wireless-security.key-mgmt wpa-psk`;
        console.log(command);
        cp.exec(command, (err, stdout, stderr) => {
            if (err) this.emit('error', {
                message: 'Error searching for wifi profile',
                error: err
            });
            if (stdout) this.emit('stdout', stdout);
            if (stderr) this.emit('stderr', stderr);
        });
    }

    config() {
        prompt(configQuestions).then(answers => {
            fs.writeFile(path.join(__dirname, '../.data/config.json'), JSON.stringify(answers, null, 4), (err) => {
                if (err) this.emit('error', {
                    message: 'Error creating new config file',
                    error: err
                });
                this.emit('configsaved');
            });
        });
    }

    _openBackupFile(params) {
        try {
            const backupFile = params.backupFile;
            const backupDir = params.backupDir;
            this.backupFd = fs.openSync(`${homedir}/${backupDir}/${backupFile}`, 'a+');
            try {
                this.backupDocText = fs.readFileSync(`${homedir}/${backupDir}/${backupFile}`, { encoding: 'utf8' });
            } catch (err) {
                this.backupDocText = '';
            }
            // fs.closeSync(this.backupFd);

        } catch (err) {
            this.emit('error', { message: 'Could not open backup files', error: err });
        }
    }

    _processWifiProfile(output, callback) {  // Unused code
        // Split the ssid from psk
        const arr = output.split('\n'),
            // remove ssid and psk from strings
            ssid = arr[0].replace(/ssid=/, ''),
            pass = arr[1].replace(/psk=/, '');

        callback({ ssid: ssid, pass: pass });
    }

    _addProileToDocument(profile, mappedDocument, callback) {
        // Check if profile is in back up file
        // const match = this.backupDocText.match(new RegExp(profile.name));
        // If its not continue
        let filteredDocument = mappedDocument.filter(doc => doc.uuid === profile.uuid);
        if (filteredDocument.length === 0) {
            // Open Backup file for appending or create if does not exist
            // Write profile to end of file and add new line
            // profile.dateSaved = new Date().toISOString();
            fs.write(this.backupFd, JSON.stringify(profile) + '\n', (err) => {
                if (err) throw err;
                callback(`Profile Written to File - ${JSON.stringify(profile)}`);
            });
        } else {
            this.emit('ignored', `Profile is already backed up = ${JSON.stringify(profile)}`);
            callback(``);
        }
    }

    _indexProfiles() {
        // Get Backup text
        let text = fs.readFileSync(`${homedir}/${this.params.backupDir}/${this.params.backupFile}`, {encoding: 'utf-8'});
        return text
            // Split lines
            .split('\n')
            // Parse json lines and add index to each profile
            .map((json, i) => {
                if (json) {
                    let obj = JSON.parse(json);
                    obj.index = i.toString();
                    return obj;
                } else {
                    return null;
                }
            })
            // Filter out blank line at end of file
            .filter(obj => obj !== null);
    }
}

module.exports = WiFiUtils;
