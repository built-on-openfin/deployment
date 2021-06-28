# Internal Hosting

### Directory Structure

/  
&nbsp;&nbsp;&nbsp;&nbsp;runtimeVersions *(static file containing hosted runtimes)*  
&nbsp;&nbsp;&nbsp;&nbsp;/rvm  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;latestVersion *(static file containing latest RVM Version)*  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;latest *(latest RVM)*  
&nbsp;&nbsp;&nbsp;&nbsp;/runtime  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;7.53.23.23 *(runtime)*  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8.56.24.41  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8.56.26.40  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;stable *(static file containing corresponding runtime version)*  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;beta  

This is the structure of the `public` directory, which mirrors the OpenFin [CDN](http://cdn.openfin.co/versions/).

## Step 1: Host Your Assets

To host this sample project:

```bash
npm install
npm start
```

This will launch a webserver (on port 5555 or PORT environment variable).

To deploy your own, simply copy the public directory (or its structure) and host it with the web server of your choice.

## Step 2: Point To Your Assets

Overwrite all applications in the Window registry  
`HKEY_CURRENT_USER -> SOFTWARE -> OpenFin -> RVM -> Settings`  
`Name: assetsUrl`  
`Type: REG_SZ`  
`Data: http://assetServerUrl`

Where http://assetServerUrl is the url of your hosted assets.

## Demo

This repository includes a sample app which targets a custom _legacy_ release channel, a sample channel specific to this project. The assets url is configured in the sample [app.json](https://github.com/openfin/hosting-demo/blob/master/app.json#L14) included in this project. To launch the sample application:

```bash
npm run oflaunch
```

The application dynamically populates a div with its current OpenFin version, as a number.

Read more about this on our [website](https://openfin.co/hosting-runtime-rvm-assets/)

## License
MIT

The code in this repository is covered by the included license.

However, if you run this code, it may call on the OpenFin RVM or OpenFin Runtime, which are covered by OpenFin’s Developer, Community, and Enterprise licenses. You can learn more about OpenFin licensing at the links listed below or just email us at support@openfin.co with questions.

https://openfin.co/developer-agreement/ <br/>
https://openfin.co/licensing/

## Support
Please enter an issue in the repo for any questions or problems. Alternatively, please contact us at support@openfin.co 
