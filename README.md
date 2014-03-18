

An asset pipeline based on commonjs and built on [browserify](http://browserify.org/). 

## Benefits

* Organize your entire application into packages (i.e. components) that have html, JavaScript, css, templates, and images.
* Serve assets in npm packages directly to your rendered pages, no more messing with `script` and `link` tags!
* Transform scss / less to css, coffee to JavaScript, etc. efficiently using transform streams.
* Keep assets used by a particular view template in the same folder as their view.
* Apply post-processors to uglify / minify / compress assets as needed.
* When developing, keep assets separate and watch for changes, reprocessing as appropriate. 

Many thanks to [James Halliday](https://twitter.com/substack) for his help and guidance in bringing this project into reality.

## How dat work?

With Cartero your whole application is organized into packages that may contain html, JavaScript, css, images, and more. A package is defined as a directory that contains a `package.json` file (e.g. all npm packages). In keeping with the current npm trend, style, image, and other assets are enumerated in a package's `package.json` using glob notation, along with any transforms that they require:

```
{
    "name" : "my-module",
    "version" : "1.0.2",
    "main" : "lib/my-module.js",
    "style" : "*.scss",
    "image" : "*.png",
    "transforms" : [ "scss-css-stream" ],
}
```

Your application's `views` folder may also contain packages. For example, consider the following directory structure:

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

Packages located in the `views` directory that have a `view` key in their `package.json` file are called __parcels__. A parcel's `view` is a path that specifies the server side template to which it corresponds. For instance, the `package.json` for the parcel `page1` looks like this:

```
{
	"view" : "page1.jade",
	"style" : "style.css"
}
```

At build time, Cartero computes the assets required by each parcel by piggy backing on browserify's dependency graph (starting from the parcel's entry point). Thus,

#### To load all the assets from a given package, all you need to do is `require( 'my-module' )`.

The assets are passed through a user-defined pipeline of transform streams, and then dropped into your static directory, along with an inventory of what assets are needed by what views. At run time, when a given view is rendered, your application asks the Cartero hook for the assets associated with that view and the exact html needed to load them, which can then simply be dropped into the view's `head` section. The result is that each view loads exactly the assets it needs, transformed and post-processed as appropriate.


## Usage

```
$ npm install -g cartero
$ cartero <viewsDir> <outputDir> [options]
```

You will also need to use a Cartero hook in your web application to return the assets needed by each view. A hook is currently available for node.js but one can quickly be developed for any server side environment.

## Command line options

```
--keepSeperate, -s      Keep css files separate, instead of concatinating them (for dev mode)

--maps, -m   	    	Enable JavaScript source maps in js bundles (for dev mode)

--watch, -w      		Watch mode - watch for changes and update output as appropriate. (for dev mode)

--postProcessor, -p		The name of a post processor module to apply to assets (e.g. uglify js, compress images).

--packageFilter, -pf    Path of JavaScript file that exports a function that transforms package.json
                        files before they are used. The function should be of the signature 
                        function( pkgJson, dirPath ) and return the parsed, transformed package.json.
                        This feature can be used to add default values to package.json files or
                        extend the package.json of third party modules without modifying them directly.

--help, -h       		Show this message

```


## API

### c = cartero( viewDirPath, dstDir, [options] )

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

#### c.on( 'done', function(){} );
Called when all assets and inventories have been written to the destination directory.

#### c.on( 'error', function( err ){} );
Called when an error occurs.

#### p.on( 'browerifyInstanceCreated', function( browserifyInstance ) );
Called when a browserify / watchify instance is created.

#### c.on( 'fileWritten', function( path, type, isBundle, watchModeUpdate ){} );
Called when an asset or bundle has been written to disk. `watchModeUpdate` is true iff the write a result of a change in watch mode.

#### c.on( 'packageCreated', function( package, isMain ){} );
Called when a new parcelify package is created. (Passed through from [parcelify](https://github.com/rotundasoftware/parcelify).)

## The output directory

Cartero processes all assets and places them in the output directory, which should be at a publicly accessible url. You don't need to understand the specifics of how assets are laid out within the output directory, since the Cartero hook will take care of giving you the assets for a particular view, but here is the lay of the land for the curious.

```
├── static
│   └── assets                                                              /* output directory */
│       ├── 66e20e747e10ccdb653dadd2f6bf05ba01df792b                        /* parcel directory */
│       │   ├── assets.json
│       │   ├── page1_bundle_14d030e0e64ea9a1fced71e9da118cb29caa6676.js
│       │   └── page1_bundle_da3d062d2f431a76824e044a5f153520dad4c697.css
│       ├── 880d74a4a4bec129ed8a80ca1f717fde25ce3932                        /* parcel directory */
│       │   ├── assets.json
│       │   ├── page2_bundle_182694e4a327db0056cfead31f2396287b7d4544.css
│       │   └── page2_bundle_5066f9594b8be17fd6360e23df52ffe750206020.js
│       ├── 9d82ba90fa7a400360054671ea26bfc03a7338bf                        /* pacakge directory */
│       │   └── robot.png
│       └── view_map.json                                                   /* view map */
```

Each subdirectory in the output directory corresponds to a particular package or parcel, and is named according to that package or parcel's unique id. Each package or parcel directory contains all the assets specific to that package and has the same directory structure of the original package. Additionally, parcel directories contain the js and css bundles for the parcel, as well as an `assets.json` file, which enumerates all the assets that need to be loaded by the parcel's view. Finally, the `view_map.json` file contains a hash that maps view paths to parcel ids. At runtime, the Cartero hook, when given the path of a view, looks up the id of the view's parcel in `view_map.json`, and then parses the `assets.json` in the parcel's directory in order to return the assets needed by that view.

## Resolving asset urls

At times it is necessary to reference the url of one asset from another, for example the url of an image from a stylesheet. Cartero applies a special transform to all assets that replaces expressions of the form `##url( path )` with the url of the asset at `path` (before any other transforms are applied). The path is resolved to a file using the node resolve algorithm and then mapped to the url that file will have once in the Cartero output directory. For instance, `##url( './icon.png' )` might evaluate to `/66e20e747e10/icon.png` (where `66e20e747e10` is the id of the current package), and `##url( 'jqueryui/imgs/icons.png' )` might evaluate to `/880d74a4a4be/imgs/icons.png`. The transform will throw an error if provided with a path that does not resolve to an asset.

## Contributers

* [James Halliday](https://twitter.com/substack)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
