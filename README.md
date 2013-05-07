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

###Terminology

* __assetLibrary__ : The directory where your common and third-party libraries are kept
* __appPages__ : The directory where server-side templates and local libraries are kept.
* __srcDir__ : The directory where the grunt task should look for the files.  This is most likely your version controlled files.
* __destDir__ : The directory where the grunt task should save the output too.  This most likely where your application will serve the files from

### bundle.json

Each directory in __assetLibrary__ can contain a `bundle.json` file.  This file supports the following properties:
* `dependencies` : The bundles this bundle depends on.
* `keepSeparate` : (default : `false`) Whether this bundle should be kept as a separate file in `prod` mode.  This is intended to be used for large, commonly used libraries such as JQueryUI.
* `subdirectories` : (default : `"/_.*/"`) Regular expression (in string format) used to determine which subdirectories are part of the bundle itself and are not their own separate bundles.
* `filePriority` : The list of files within the bundle that should be sourced first because other files depend on them.  The order of the files in the list is honored.

### Options

#### assetLibrary
Type: `Object`

Properties
* srcDir
* destDir
* filesToIgnore
* directoriesToIgnore

#### appPages
Type: `Object`

Properties
* srcDir
* destDir
* filesToIgnore
* directoriesToIgnore

### mode
Type: `String` Default: `dev`

`dev` or `prod`.  `prod` will concat, minify, etc.

### useDirectoriesForDependencies
Type: `Boolean`

Whether the directory structure in the __assetLibrary__ directory should drive the bundle dependency.  If `true`, a bundle's parent directory will automatically be added as a dependent bundle.

### serverSideTemplateSuffix
Type: `String` Default: `.swig`

The suffix of the server-side templates being used.

### minificationTasks
Type: `Array`

List of minification tasks that shoudl be run when `mode == "prod"`.  Each item should contain the following properties:
* `name` : The name of the grunt task to run.
* `suffixes` : List of suffixes to apply this grunt task too
* `options` : Task-specific options to be passed through to the grunt task itself.


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
