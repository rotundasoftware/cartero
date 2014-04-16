# cartero

A streaming asset pipeline based on [npm packages](https://www.npmjs.org) and [browserify](http://browserify.org/). 

[![build status](https://secure.travis-ci.org/rotundasoftware/cartero.png)](http://travis-ci.org/rotundasoftware/cartero)
## Benefits

* Organize your app into packages containing HTML, JavaScript, css, and images.
* Efficiently transform scss / less to css, coffee to JavaScript, etc. using streams.
* Automatically output the `script` and `link` tags each page needs to load its js / css assets.
* Keep assets used by a particular view template in the same folder as their view.
* Use post-processor transform streams to uglify / minify / compress assets.
* When developing, keep assets separate and watch for changes, reprocessing as appropriate. 

Many thanks to [James Halliday](https://twitter.com/substack) for his help and guidance in bringing this project into reality.

## Overview

The days of organizing assets into directories by their type are over. The new black is organizing applications into packages that contain HTML, JavaScript, css, and images. [npm](https://www.npmjs.org/‎) is a powerful platform for managing and sharing such packages. Cartero makes it easy for web apps to consume them.

A package is defined as a directory that contains a [package.json](https://www.npmjs.org/doc/json.html) file. In addition to standard npm package.json properties, stylesheets and other assets of a package may be enumerated using globs, along with any transforms they require (as implemented in [parcelify](https://github.com/rotundasoftware/parcelify), on which cartero is built).

```
{
    "name" : "my-module",
    "version" : "1.0.2",
    "main" : "lib/my-module.js",

    "style" : "*.scss",
    "image" : [ "icon.png" ],
    "transforms" : [ "scss-css-stream" ]
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

The `package.json` file of a parcel *must* have a special `view` key that specifies the server side template to which the parcel corresponds. For instance, the `package.json` for the `page1` parcel might look like this:

```
{
	"view" : "page1.jade",
	"style" : "style.css"
}
```

__At build time,__ cartero runs browserify on each parcel in your view directory, saves the js bundle that is generated, and uses the js dependency graph to collect the other assets needed by the parcel. The other assets are then passed through a user-defined pipeline of transform streams and dropped into your static directory, along with meta used to find the assets used by each view at run time. (Most of the bundling and transform work is actually done by [parcelify](https://github.com/rotundasoftware/parcelify).)

__At run time,__ when a given view is rendered, your application asks the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook) for the HTML needed to load the js / css assets associated with that view, which can then simply be dropped into the view's HTML. Your application is also able to access / use other assets like images and templates via the hook.

## Usage

```
$ npm install -g cartero
$ cartero <viewsDir> <outputDir> [options]
```

Once you've run cartero, you'll ask the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook) at run time for the assets needed by each view. A hook is currently only available for node.js but one can quickly be developed for any environment.

## Command line options

```
--outputDirUrl, -o      The base url of the cartero output directory (e.g. "/assets"). Defaults to "/".

--transform, -t         Name or path of a default transform. (See discussion of `appTransforms` option.)

--postProcessor, -p     The name of a post processor module to apply to assets (e.g. uglifyify, etc.).

--maps, -m   	    	Enable JavaScript source maps in js bundles (for dev mode).

--keepSeperate, -s      Keep css files separate, instead of concatenating them (for dev mode).

--watch, -w      		Watch mode - watch for changes and update output as appropriate (for dev mode).

--help, -h       		Show this message.
```

## Tranforms

### Package specific (local) transforms

The safest and most portable way to apply transforms like sass -> css or coffee -> js is using the `transforms` key in a package's package.json. The key should be an array of names or file paths of [transform modules](https://github.com/substack/module-deps#transforms). For example,

```
{
  "name": "my-module",
  "description": "Example module.",
  "version": "1.5.0",

  "style" : "*.scss",
  "transforms" : [ "sass-css-stream" ],
  "dependencies" : {
    "sass-css-stream": "~0.0.1"
  }
}
```

All transform modules are called on all assets plus JavaScript files. It is up to the transform module to determine whether or not it should apply itself to a file (usually based on the file extension).

### Application level transforms

You can apply transforms to all packages within your `views` directory using the `-t` command line argument (or the `appTransforms` option). Packages inside a `node_modules` folder located inside of your views directory are not effected. (You can apply your application transforms to additional directories as well using the `transformDir` command line argument.)

```
$ cartero views static/assets -t "sass-css-stream"
```

### Built-in transforms

There are two built-in transforms that cartero automatically applies to all packages.

#### The relative to absolute path transform (style assets only)

Cartero automatically applies a transform to your style assets that replaces relative urls with absolute urls, calculated using the `outputDirUrl` option (after any local / default transforms are applied). This transform is necessary so that relative urls do not break when css files are concatenated into bundles. For example, the following url reference in a third party module will work even after concatenation:

```css
div.backdrop {
    background: url( 'pattern.png' );
}
```

#### The ##asset_url() transform (to resolve asset urls)

At times it is useful to resolve the url of an asset, for example in order to reference an image in one package from another. For this reason, cartero applies a special transform to all assets that replaces expressions of the form `##asset_url( path )` with the url of the asset at `path` (after any local / default transforms are applied). The path is resolved to a file using the node resolve algorithm and then mapped to the url that file will have once in the cartero output directory. For instance, in `page1/index.js`:

```javascript
myModule = require( 'my-module' );

$( 'img.my-module' ).attr( 'src', '##asset_url( "my-module/icon.png" )' );
```

The same resolution algorithm can be employed at run time (on the server side) via the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook).

## API

### c = cartero( viewsDir, outputDir, [options] )

`viewsDir` is the path of the your views directory. `outputDir` is the path of the directory into which all of your processed assets will be dropped (along with some meta data). It should be a directory that is exposed to the public so assets can be loaded using script / link tags (e.g. the `static` directory in express applications). Options are as follows:

* `assetTypes` (default: [ 'style', 'image' ]) - The keys in package.json files that enumerate assets that should be copied to the cartero output directory.
* `assetTypesToConcatenate` (default: [ 'style' ]) - A subset of `assetTypes` that should be concatenated into bundles. Note JavaScript files are special cased and are always both included and bundled.
* `outputDirUrl` (default: '/') - The base url of the output directory.
* `appTransforms` (default: undefined) - An array of [transform modules](https://github.com/substack/module-deps#transforms) names / paths or functions to be applied to all packages in directories in the `appTransformDirs` array.
* `appTransformDirs` (default: [ viewsDir ]) - `appTransforms` are applied to any packages that are within one of the directories in this array. (The recursive search is stopped on `node_module` directories.)
* `packageTransform` (default: undefined) - A function that transforms package.json files before they are used. The function should be of the signature `function( pkgJson, path )` and return the parsed, transformed package object. This feature can be used to add default values to package.json files or alter the package.json of third party modules without modifying them directly.
* `sourceMaps` (default: false) - Enable js source maps (passed through to browserify).
* `watch` (default: false) - Reprocess assets and bundles (and meta data) when things change.
* `postProcessors` (default: []) - An array of post-procesor functions or module names / paths. Post-processors should have the same signature as [transform modules](https://github.com/substack/module-deps#transforms).

A cartero object is returned, which is an event emitter.

#### c.on( 'done', function(){} );
Called when all assets and meta data has been written to the destination directory.

#### c.on( 'error', function( err ){} );
Called when an error occurs.

#### p.on( 'browerifyInstanceCreated', function( browserifyInstance ) );
Called when a browserify / watchify instance is created.

#### c.on( 'fileWritten', function( path, assetType, isBundle, watchModeUpdate ){} );
Called when an asset or bundle has been written to disk. `watchModeUpdate` is true iff the write is a result of a change in watch mode.

#### c.on( 'packageCreated', function( package, isMain ){} );
Called when a new [parcelify](https://github.com/rotundasoftware/parcelify) package is created.

## FAQ

#### Q: What is the best way to handle client side templates?

You can include client side templates in your packages by adding `template` to the `assetTypes` options and using a `template` key in your package.json files that behaves in the exact same was a the style key. The `assets.json` file for a parcel (and the data returned by the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook)) will then contain an entry for templates required by that parcel, just like the one for styles, which you can inject into the view's HTML. However, if you plan to share your packages we recommend against this practice as it makes your packages difficult to consume. Instead we recommend using a browserify transform like [nunjucksify](https://github.com/rotundasoftware/nunjucksify) or [node-hbsfy](https://github.com/epeli/node-hbsfy) to precompile templates and `require` them explicitly from your JavaScript files.

#### Q: What does cartero write to the output directory?

You generally don't need to know the anatomy of cartero's output directory, since the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook) serves as a wrapper for the information / assets in contains, but here is the lay of the land for the curious. Note the internals of the output directory are not part of the public API and may be subject to change.

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

* Each subdirectory in the output directory
  * corresponds to a particular package (or parcel),
  * is named using that package's unique id,
  * contains all the assets specific to that package, and
  * has the same directory structure as the original package.
* Parcel directories also contain an `assets.json` file, which enumerates the assets used by the parcel.
* The `view_map.json` file maps view paths (relative to `viewsDir`, shashumed for security) to parcel ids.
* The `package_map.json` file maps absolute package paths (shashumed for security) to package ids.

#### Q: Is it safe to let browsers cache asset bundles?

Yes. The name of asset bundles generated by cartero includes an shasum of their contents. When the contents of one of the files changes, its name will be updated, which will cause browsers to request a new copy of the content. (The [Rails Asset Pipeline](http://guides.rubyonrails.org/asset_pipeline.html) implements the same cache busting technique.)

#### Q: Will relative urls in css files break when cartero bundles them into one file?

Well, they would break, but cartero automatically applies a tranform to all your style assets that replaces relative urls with absolute urls, calculated using the `outputDirUrl` option. So no, they won't break.

## Contributers

* [James Halliday](https://twitter.com/substack) (Design, sage advice, supporting modules.)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
