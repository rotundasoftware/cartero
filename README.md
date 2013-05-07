# grunt-asset-bundler

> Bundles your assets, and so much more

## Getting Started
This plugin requires Grunt `~0.4.0`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-asset-bundler --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-asset-bundler');
```

*This plugin was designed to work with Grunt 0.4.x. If you're still using grunt v0.3.x it's strongly recommended that [you upgrade](http://gruntjs.com/upgrading-from-0.3-to-0.4), but in case you can't please use [v0.3.2](https://github.com/gruntjs/grunt-contrib-less/tree/grunt-0.3-stable).*


## assetbundler task
_Run this task with the `grunt assetbundler` command._

Task targets, files and options may be specified according to the grunt [Configuring tasks](http://gruntjs.com/configuring-tasks) guide.
### Options

#### assetLibrary
Type: `Object`
Properties
* srcDir
* destDir

#### appPages
Type: `Object`
Properties
* srcDir
* destDir

#INSTRUCTIONS

clone this repository
```shell
git clone https://github.com/rotundasoftware/assetBundler.git
```
cd to your application directory and install
```shell
npm install path/to/assetBundler/
```
update your package.json to include the following dependencies (list to be trimmed down)

    "express": "3.1.0",
    "grunt": "~0.4.1",
    "underscore": "~1.4.4",
    "underscore.string": "~2.3.1",
    "findit": "~0.1.2",
    "swig": "~0.13.5",
    "consolidate": "~0.9.0",
    "path": "~0.4.9",
    "grunt-contrib-copy": "~0.4.1",
    "grunt-contrib-clean": "~0.4.1",
    "grunt-contrib-sass": "~0.3.0",
    "grunt-contrib-less": "~0.5.1",
    "grunt-contrib-coffee": "~0.7.0",
    "grunt-contrib-stylus": "~0.5.0",
    "grunt-contrib-concat": "~0.3.0",
    "grunt-contrib-watch": "~0.3.1",
    "grunt-bundler": "~0.1.0",
    "grunt-contrib-uglify": "~0.2.0",
    "grunt-contrib-htmlmin": "~0.1.3",
    "grunt-contrib-compass": "~0.2.0"
    
```shell
npm install
```

copy the Gruntfile.js from examples/bundler_sample_1 and modify appropriately

TODOs:
