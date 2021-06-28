const openfinLauncher = require('openfin-launcher');

openfinLauncher.launchOpenFin({
    configPath: 'http://localhost:5555/manifest'
})
.then(() => console.log('Successful launch!'))
.fail((error) => console.log(`Launch error! ${error}`));