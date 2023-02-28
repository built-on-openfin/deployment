# Internal Hosting

This example has been created to demonstrate how an internal CDN will work. Please note that for this demo you will need access to the OpenFin CDN to pull down the latest runtime. If you are completely offline and or cannot download from the OpenFin CDN please reach out to **deployment@openfin.co** and we will provide you with the runtime offline.

## Step 1: Host Your Assets

To host this sample project:

Please navigate to self-hosting-example folder via command line

*The directory created when **npm run build** is executed is the structure of the `public` directory, which mirrors the OpenFin [CDN](http://cdn.openfin.co/versions/).*

```
npm install
npm run build
npm start
```

This will launch a webserver (on port 5555 or PORT environment variable).

To deploy your own, simply copy the public directory (or its structure) and host it with the web server of your choice.

## Step 2: Point To Your Assets

We recommend using Desktop Owner Settings to point to your assets. Desktop owner settings are global settings that control aspects of the OpenFin environment on an individual computer or device.

More information here: https://developers.openfin.co/of-docs/docs/desktop-owner-settings

Please set a assetsUrl in DOS where http://assetServerUrl is the url of your hosted assets e.g. http://localhost:5555/ for this sample.

### **assetsUrl for self hosting example**

```
{
    "desktopSettings": {
        "assetsUrl": "http://localhost:5555/"
   }
                }
```

Registry entry:

`Path: HKEY_CURRENT_USER\SOFTWARE\OpenFin\RVM\Settings`  
`String Value: DesktopOwnerSettings`    
`Value Data: https://example.com/company/files/end-user-desktop-owner-settings.json`



## Demo

A sample app will be created in this repository which targets a custom version which is fetched from the custom asset location.

To launch the sample application load the launch page in the browser using the command below and then click on the fins link to launch the application:

```bash
npm run launch
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
