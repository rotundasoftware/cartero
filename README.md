# cartero

An asset pipeline designed to reduce the friction involved in applying modular design principles to front end web development. Built on [npm](https://www.npmjs.org) and [browserify](http://browserify.org/). 

[![Build Status](https://travis-ci.org/rotundasoftware/cartero.svg?branch=master)](https://travis-ci.org/rotundasoftware/cartero)

## Overview

Modularization is *the fundamental tool* that programmers have to keep large code bases manageable. Yet there are [very few easy ways](https://medium.com/what-i-learned-building/5a31feb15e2) to modularize client side code in web applications today. [Web Components](http://css-tricks.com/modular-future-web-components/) aims to fill this void several years down the road. cartero provides a solution today.

cartero allows you to easily organize your front end code into reusable packages containing HTML, JavaScript, css, and images. And since cartero is built on [npm](https://www.npmjs.org), the official node.js package manager, you can easily publish your packages and / or depend on other npm packages in your own code. Depending on a package is as simple as `require( 'pork-and-beans' )`.

cartero is primarily a build tool, similar to (and based on) [browserify](http://browserify.org/), but with consideration for additional asset types, and designed for complete applications, instead of a single entry point. cartero does not introduce many new concepts, and the same modular organizational structure it facilitates could also be achieved by stringing together other build tools and the appropriate `<script>`, `<link>`, and `<img>` tags. However, cartero is built from the ground up for modularized applications, and eliminates the friction that occurs when using conventional build tools with modular directory structures.

See [this article](https://github.com/rotundasoftware/cartero/blob/master/comparison.md) for more info on how cartero compares to other tools, and [this tutorial](http://www.jslifeandlove.org/intro-to-cartero/) to get started.

### The build command

Just one command builds all assets for a multi-page application.

```
$ cartero ./views ./static/assets
```

The cartero command bundles up the js and css assets required by each entry point found in `./views` and drops them into the output directory at `./static/assets` (along with information used at run time by [the hook](#the-hook)). Adding a `-w` flag will run cartero in watch mode so that the output is updated whenever assets are changed. cartero's watch mode is extremely efficient, only rebuilding what is necessary for a given change.

### The hook

But the friction involved in modularizing front end code is not limited to build time, especially in multi-page applications. At run time, your application needs to be able to easily figure out where assets are located. For this reason, cartero provides a small ([< 100 LOC](https://github.com/rotundasoftware/cartero-node-hook/blob/master/index.js)) runtime library that your server side logic can use to look up asset urls or paths (based on a map output by cartero at build time). At the time of this writing, only a [hook for node.js](https://github.com/rotundasoftware/cartero-node-hook) is available, but one can quickly be written for any server side environment.

For example, if a `package.json` is provided in `./views/page1`, the following call will return the `script` and `link` tags needed to load its js and css bundles:

```javascript
h.getParcelTags( 'views/page1', function( err, scriptTags, styleTags ) {
  // scriptTags and styleTags and strings of <script> and <link> tags, respectively.

  // attach the tags to the express res.locals so we can
  // output them in our template to load the page's assets
  res.locals.script = scriptTags;
  res.locals.style = styleTags;
} );
```

You can also ask the cartero hook to lookup the url of a specific asset. For example, to find the url of `carnes.png` in the `grill` package.


```javascript
h.getAssetUrl( path.join( resolve( 'grill' ), 'carnes.png' ), function( err, url ) {
  res.locals.imgUrl = url;
} );
```

Relying on the hook at run time to find assets, instead of limiting cartero strictly to build time, also provides several others benefits - it enables cartero to implement cache busting through [fingerprinting](http://guides.rubyonrails.org/asset_pipeline.html#what-is-fingerprinting-and-why-should-i-care-questionmark), and to keep css files separate in dev mode without forcing you to modify your view templates.

## Packages and parcels

cartero packages are just regular npm packages that include style and / or image assets, enumerated in glob notation (as described in the [parcelify](https://github.com/rotundasoftware/parcelify) docs). For example,

```
{
    "name" : "my-module",
    "version" : "1.0.2",
    "main" : "lib/my-module.js",
    "dependencies" : { ... },

    "style" : "*.scss",         // styles
    "image" : [ "icon.png" ]    // images
}
```

Packages can be in any location, just like in node.js. The CommonJS `require( 'modules' )` syntax is used to import a module from a package, along with all its css and other assets. The argument to `require` is resolved resolved by [browserify](http://browserify.org/) using the [node resolve algorthim](https://github.com/substack/node-resolve).

A **parcel** is just a package that is an entry point. A parcel generally is used by one or more pages in your application. The collection of assets used by a given page is, after all, a package -- it has its own js and css, may depend on other packages, or may be depended upon. In fact, the parallel is so strong, it is recommend (but not required) that you put your parcels in your `views` directory, together with the server side view templates to which they correspond. For example:


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
    │   ├── page1.jade        /* server side template */
    │   ├── style.css
    │   └── index.js
    └── page2                 /* parcel */
        ├── package.json
        ├── style.css
        ├── page2.jade        /* server side template */
        └── index.js
```

## Usage

```
$ npm install -g cartero
$ cartero <parcelsDir> <outputDir> [options]
```

The `cartero` command scans `parcelsDir` recursively for parcels, i.e. directories that contain `package.json` files with valid js entry points (either `index.js` or the `main` property in `package.json`). It runs [parcelify](https://github.com/rotundasoftware/parcelify) on the entry point of each parcel, saving all the parcel's assets as well as those of its dependencies in the `outputDir`. (Note `node_modules` directories nested within the `parcelsDir` are not scanned.)

At run time, the HTML tags needed to load a parcel's js and css bundles, as well as its other assets, can be found using the [cartero hook's](https://github.com/rotundasoftware/cartero-node-hook) `getParcelTags` and `getParcelAssets` methods. The [cartero express middleware](https://github.com/rotundasoftware/cartero-express-middleware) can be used for an added level of convenience.

## Command line options

```
--transform, -t         Name or path of a application level transform. (See discussion of `appTransforms` option.)

--watch, -w             Watch mode - watch for changes and update output as appropriate (for dev mode).

--postProcessor, -p     The name of a post processor module to apply to assets (e.g. uglifyify, etc.).

--maps, -m              Enable JavaScript source maps in js bundles (for dev mode).

--keepSeperate, -s      Keep css files separate, instead of concatenating them (for dev mode).

--outputDirUrl, -o      The base url of the cartero output directory (e.g. "/assets"). Defaults to "/".

--help, -h              Show this message.
```

## Tranforms

### Package specific (local) transforms

The safest and most portable way to apply transforms to a package (like Sass -> css or CoffeeScript -> js) is using the `transforms` key in a package's package.json. The key should be an array of names or file paths of [transform modules](https://github.com/substack/module-deps#transforms). For example,

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

All transform modules are called on all assets (including JavaScript files). It is up to the transform module to determine whether or not it should apply itself to a file (usually based on the file extension).

### Application level transforms

You can apply transforms to all all packages in your `parcelsDir` using the `-t` command line argument. (`node_modules` directories inside the parcelsDir will not be effected.) You can also apply your application transforms to additional directories using the `transformDir` command line argument.)

```
$ cartero views static/assets -t "sass-css-stream"
```

### Built-in transforms

There are two built-in transforms that cartero automatically applies to all packages.

#### The relative to absolute path transform (style assets only)

Cartero automatically applies a transform to your style assets that replaces relative urls with absolute urls (after any local / default transforms are applied). This transform makes relative urls work even after css files are concatenated into bundles. For example, the following url reference in a third party module will work even after concatenation:

```css
div.backdrop {
    background: url( 'pattern.png' );
}
```

#### The ##asset_url() transform (to resolve asset urls)

At times it is necessary to resolve the url of an asset at build time, for example in order to reference an image in one package from another. For this reason, cartero applies a special transform to all assets that replaces expressions of the form `##asset_url( path )` with the url of the asset at `path` (after any local / default transforms are applied). The path is resolved to a file using the node resolve algorithm and then mapped to the url that file will have once in the cartero output directory. For instance, in `page1/index.js`:

```javascript
myModule = require( 'my-module' );

$( 'img.my-module' ).attr( 'src', '##asset_url( "my-module/icon.png" )' );
```

The same resolution algorithm can be employed at run time (on the server side) via the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook).

## API

### c = cartero( parcelsDir, outputDir, [options] )

`viewsDir` is the path of the your views directory. `outputDir` is the path of the directory into which all of your processed assets will be dropped (along with some meta data). It should be a directory that is exposed to the public so assets can be loaded using script / link tags (e.g. the `static` directory in express applications). Options are as follows:

* `assetTypes` (default: [ 'style', 'image' ]) - The keys in package.json files that enumerate assets that should be copied to the cartero output directory.
* `assetTypesToConcatenate` (default: [ 'style' ]) - A subset of `assetTypes` that should be concatenated into bundles. Note JavaScript files are special cased and are always both included and bundled.
* `outputDirUrl` (default: '/') - The base url of the output directory.
* `appTransforms` (default: undefined) - An array of [transform modules](https://github.com/substack/module-deps#transforms) names / paths or functions to be applied to all packages in directories in the `appTransformDirs` array.
* `appTransformDirs` (default: [ parcelsDir ]) - `appTransforms` are applied to any packages that are within one of the directories in this array. (The recursive search is stopped on `node_module` directories.)
* `packageTransform` (default: undefined) - A function that transforms package.json files before they are used. The function should be of the signature `function( pkgJson, pkgPath )` and return the parsed, transformed package object. This feature can be used to add default values to package.json files or alter the package.json of third party modules without modifying them directly.
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
* The `parcel_map.json` file maps parcel paths (relative to `parcelsDir`) to parcel ids.
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
