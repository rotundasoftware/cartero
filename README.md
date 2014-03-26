# Cartero

A streaming build system / asset pipeline based on [npm](https://www.npmjs.org/‎) packages and [browserify](http://browserify.org/). 

## Benefits

* Organize your app into packages containing HTML, JavaScript, css, and images.
* Efficiently transform scss / less to css, coffee to JavaScript, etc. using streams.
* Serve assets directly to your rendered pages, no more messing with `script` and `link` tags!
* Keep assets used by a particular view template in the same folder as their view.
* Use post-processor transform streams to uglify / minify / compress assets.
* When developing, keep assets separate and watch for changes, reprocessing as appropriate. 

Many thanks to [James Halliday](https://twitter.com/substack) for his help and guidance in bringing this project into reality.

## Overview

The days of organizing directories by the type of files they contain are over. The new black is organizing applications into packages that contain HTML, JavaScript, css, images, and / or other assets. Cartero is a build system and asset pipeline built from the ground up for this new paradigm.

An package is a directory that contains a [package.json](https://www.npmjs.org/doc/json.html) file. In addition to the npm spec, Cartero allows style and other assets to be enumerated in `package.json` files using glob notation, along with any transforms they require:

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

Your application's `views` folder may also contain packages. Such "view packages" are called __parcels__. For example, consider this directory structure:

```
├── node_modules
│   └── my-module
│       ├── index.js
│       ├── icon.png
│       ├── package.json
│       └── style.scss
└── views
    ├── page1                 /* parcel */
    │   ├── package.json
    │   ├── page1.jade
    │   ├── style.css
    │   └── index.js
    └── page2                 /* parcel */
        ├── package.json
        ├── style.css
        ├── page2.jade
        └── index.js
```

The `package.json` of a parcel *must* have a `view` key that specifies the server side template to which the parcel corresponds. For instance, the `package.json` for the parcel `page1` looks like this:

```
{
	"view" : "page1.jade",
	"style" : "style.css"
}
```

__At build time,__ Cartero computes the assets required by each parcel by inspecting browserify's dependency graph (starting from the parcel's entry point). Assets are passed through a user-defined pipeline of transform streams, bundled when appropriate, and then dropped into your static directory, along with inventories of the assets used by each view.

__At run time,__ when a given view is rendered, your application asks the Cartero hook for the HTML needed to load the js/css assets associated with that view, which can then simply be dropped into the view's HTML. Your application is also able to access / use other assets like images and templates via the hook.

## Usage

```
$ npm install -g cartero
$ cartero <viewsDir> <outputDir> [options]
```

You will also want to use the [Cartero hook](https://github.com/rotundasoftware/cartero-node-hook) in your web application. A hook is currently only available for node.js but one can quickly be developed for any server side environment.

## Command line options

```
--keepSeperate, -s      Keep css files separate, instead of concatenating them (for dev mode)

--maps, -m   	    	Enable JavaScript source maps in js bundles (for dev mode)

--watch, -w      		Watch mode - watch for changes and update output as appropriate. (for dev mode)

--postProcessor, -p		The name of a post processor module to apply to assets (e.g. uglifyify, etc.).

--help, -h       		Show this message

```

## Resolving asset urls

At times it is necessary to resolve the url of an asset, for example to reference an image from a stylesheet. Cartero applies a special transform to all assets that replaces expressions of the form `##url( path )` with the url of the asset at `path` (*after* any other transforms are applied). The path is resolved to a file using the node resolve algorithm and then mapped to the url that file will have once in the Cartero output directory. For instance, in `my-module.css`:

```
div.icon {
    background: url( ##url( 'my-module/icon.png' ) );
}
```

or in `page1/index.js`:

```javascript
myModule = require( 'my-module' );

$( 'img.my-module' ).attr( 'src', '##url( "my-module/icon.png" )' );
```

## API

### c = cartero( viewDir, outputDir, [options] )

`viewDir` is the path of the your views directory. `outputDir` is the path of the directory into which all of your processed assets will be dropped (along with the meta data that will be used to look up the assets needed by each view). It should be a directory that is exposed to the public so assets can be loaded using script / link tags (e.g. the `static` directory in express applications). Options are as follows:

```javascript
{
    assetTypes : [ 'style', 'template', 'image' ],      // asset keys in package.json files
    assetTypesToConcatinate : [ 'style', 'template' ],  // asset types to concat into bundles
    
    outputDirUrl : '/',             // the base url of the output directory

    /* packageTransform is function that transforms package.json files before they are used.
    The function should be of the signature function( pkgJson, dirPath ) and return the parsed,
    transformed package.json. This feature can be used to add default values to package.json
    files or alter the package.json of third party modules without modifying them directly. */
    packageTransform : undefined,

    sourceMaps : false,            // js source maps (passed through to browserify)
    watch : false,                 // re-process as appropriate when things change
    postProcessors : []            // an array of postProcesor functions or module names
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
Called when an asset or bundle has been written to disk. `watchModeUpdate` is true iff the write is a result of a change in watch mode.

#### c.on( 'packageCreated', function( package, isMain ){} );
Called when a new parcelify package is created. (Passed through from [parcelify](https://github.com/rotundasoftware/parcelify).)

## The output directory

You generally don't need to know the anatomy of Cartero's output directory, since the Cartero hook serves as a wrapper for the information / assets in contains, but here is the lay of the land for the curious. Note the internals of the output directory are not part of the public API and may be subject to change.

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
│       ├── 9d82ba90fa7a400360054671ea26bfc03a7338bf                        /* package directory */
│       │   └── robot.png
│       ├── package_map.json
│       └── view_map.json
```

* Each subdirectory in the output directory corresponds to a particular package or parcel, and is named using that package or parcel's unique id.
* Each package or parcel directory contains all the assets specific to that package and has the same directory structure of the original package.
* Parcel directories also contain an `assets.json` file, which enumerates the assets used by the parcel.
* The `package_map.json` file contains a hash that maps absolute package paths (shashumed for security) to package ids.
* The `view_map.json` file contains a hash that maps view paths (relative to the view directory, shashumed for security) to parcel ids.

## FAQ

#### Q: What about client side templates?

You can include client side templates in your packages using a `template` key in your `package.json` file that behaves in the exact same was a the style key. The `assets.json` file for a parcel (and the data returned by the cartero hook) will then contain an entry for templates required by that parcel, just like the one for styles, which you can then inject into the view's HTML. However, if you plan to share your packages we recommend against this practice as it makes your packages difficult to consume. Instead we recommend using a browserify transform like [node-hbsfy](https://github.com/epeli/node-hbsfy) or [nunjucksify](https://github.com/rotundasoftware/nunjucksify) to precompile templates and `require` them explicitly from your JavaScript files.

#### Q: Does Cartero address the issue of cache busting?

The name of asset bundles generated by Cartero includes an shasum of their contents. When the contents of one of the files changes, its name will be updated, which will cause browsers to request a new copy of the content. The [Rails Asset Pipeline](http://guides.rubyonrails.org/asset_pipeline.html) implements the same cache busting technique.

#### Q: Will relative urls in my css files break when Cartero bundles them into one file?

Well, they would break, but Cartero automatically applied a tranform to all your style assets that replaces relative `url()`s with absolute urls, calculated using the `outputDirUrl` option.

## Contributers

* [James Halliday](https://twitter.com/substack)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
