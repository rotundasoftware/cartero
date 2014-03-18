

An asset pipeline based on commonjs and built on [browserify](http://browserify.org/). 

## Benefits

* Organize your application into components with JavaScript, css, templates, and images.
* Get your JavaScript, css, and other assets where you need them in the form you need them in.
* Include css and images in npm modules and then serve them directly to your rendered pages.
* Keep assets used by a particular view template in the same folder as the view.
* Easily serve only the assets that are required by each page in multi-page applications.

## How dat work?

Cartero let's you organize your application so that the assets that pertain to a particular view are kept in the same folder as the view's template, and assets needed by multiple views can be kept in a `node_modules` directory and pulled in using `require( 'my-module' )`. For example, consider the following directory structure:

```
├── node_modules
│   └── my-module
│       ├── index.js
│       ├── icon.png
│       ├── package.json
│       └── style.scss
└── views
    ├── page1
    │   ├── package.json
    │   ├── page1.jade
    │   ├── style.css
    │   └── index.js
    └── page2
        ├── package.json
        ├── style.css
        ├── page2.jade
        └── index.js
```

The `package.json` for each package enumerates the style and image assets in the package. For instance, `my-module/package.json`:

```
{
	"style" : "*.scss",
	"image" : "*.png",
	"transforms" : [ "scss-css-stream" ]
}
```

Additionally, packages located in the `views` directory may contain a `view` key that specifies a server side view template in that package. Such packages are called __parcels__. For instance, `page1` is a parcel because it is in the `views` directory and `page1/package.json` contains a `view` key:

```
{
	"view" : "page1.jade",
	"style" : "*.css"
}
```

At build time, Cartero runs through every parcel, computing the assets each parcel needs by piggy backing on the browserify dependency graph. The assets, transformed and concatinated / minified as appropriate, are dropped into your static directory, along with an inventory of what assets are needed by what views. At run time, when a given view is rendered, your application asks the cartero hook for the assets associated with that view and the exact html needed to load them, which can then simply be dropped into the view's `head` section. The result is that each view gets exactly the assets it needs in the form it needs them in.


## Usage

```
$ npm install -g cartero
$ cartero views static/assets
```

You will also need to install the cartero hook in your web application. The hook is currently available for node.js but easily portable to any server side environment.

## Command line options

```
--keepSeperate, -s      Keep css files separate, instead of concatinating them

--maps, -m   	    	Enable JavaScript source maps in js bundles

--watch, -w      		Watch mode - watch for changes and update output as appropriate.

--postProcessor, -p		The name of a post processor module to apply to assets (e.g. uglify js, compress images).

--packageFilter, -pf    Path of JavaScript file that exports a function that transforms package.json
                        files before they are used. The function should be of the signature 
                        function( pkgJson, dirPath ) and return the parsed, transformed package.json.
                        This feature can be used to add default values to package.json files or
                        extend the package.json of third party modules without modifying them directly.

--help, -h       		Show this message

```


## API

#### c = cartero( viewDirPath, dstDir, [options] )

`viewDirPath` is the path of the your views directory. `dstDir` is the directory into which all of your processed assets will be dropped (along with the internal inventories that will be used to look up the assets needed by each view). It should be a directory that is exposed to the public so assets can be loaded using script / link tags (e.g. the `static` directory in express applications). Options are as follows:

```javascript
{
    keepSeperate : false,       // keep css files separate, instead of concatinating them
    sourceMaps : false,         // js source maps (passed through to browserify)
    watch : false,              // re-process as appropriate when things change
    postProcessors : [],        // an array of names of postProcesor transform modules

    packageFilter : undefined   // a function as described in the -pf command line arg
}
```

A cartero object is returned, which is an event emitter.

### c.on( 'done', function(){} );
Called when all assets and inventories have been written to the destination directory.

### c.on( 'error', function( err ){} );
Called when an error occurs.

### c.on( 'fileWritten', function( path, type, isBundle, watchModeUpdate ){} );
Called when an asset or bundle has been written to disk. `watchModeUpdate` is true iff the write a result of a change in watch mode.

### c.on( 'packageCreated', function( package, isMain ){} );
Called when a new parcelify package is created. (Passed through from [parcelify](https://github.com/rotundasoftware/parcelify).)

## Contributers

* [James Halliday](https://twitter.com/substack)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
