# cartero

cartero is an asset pipeline built on [npm](https://www.npmjs.org) and [browserify](http://browserify.org/) that allows you to easily organize front end code in multi-page web applications into reusable packages containing HTML, JavaScript, css, and images.

[![Build Status](https://travis-ci.org/rotundasoftware/cartero.svg?branch=master)](https://travis-ci.org/rotundasoftware/cartero)

## Overview

cartero eliminates the friction involved in applying modular design principles to front end assets in multi-page web applications. Use directories to group together assets (js, css, images, etc.) for each UI component, and catero will take care of ensuring that all the appropriate assets are then loaded on the pages that require them, and just those pages. Depending on a package is as simple as `require( 'pork-and-beans' )`. And since cartero is built on [npm](https://www.npmjs.org), the official node.js package manager, so you can easily publish your packages and / or depend on other npm packages in your own code.

A package might contain assets for

* A calendar widget
* A popup dialog
* A header or footer
* An entire web page

cartero is a build tool. cartero does not introduce many new concepts, and the same modular organizational structure it facilitates could also be achieved by stringing together other build tools and the appropriate `<script>`, `<link>`, and `<img>` tags. However, using cartero is, well, a whole lot easier.

See [this article](https://github.com/rotundasoftware/cartero/blob/master/comparison.md) for more info on how cartero compares to other tools, and [this tutorial](http://www.jslifeandlove.org/intro-to-cartero/) to get started.

### Command line usage

Build all assets for a multi-page application with the cartero command. For example,

```
$ cartero ./views/**/index.js ./static/assets
```

This command will gather up the js and other assets required by each JavaScript entry point matching the first argument (in this case, all `index.js` files in the `views` directory), and drop the compiled assets into the output directory specified in the second argument, along with information used at run time by [the hook](#the-hook), to load the appropriate assets for each entry point.

Cartero only processes each asset one time, so compiling assets for many entry points at once is extremely efficient, each additional entry point adding practically no overhead. Cartero also separates out the JavaScript assets that are used by all your entry points into a common bundle, so that the browser cache can be leveraged to load any shared logic quickly on each page. (This magic is done by [factor-bundle](https://github.com/substack/factor-bundle) - thanks for your [wizardry](http://cyber.wizard.institute/), James!)

Adding a `-w` flag to the cartero command will run cartero in watch mode so that the output is updated whenever assets are changed. Again, cartero's watch mode is extremely efficient, only rebuilding what is necessary for a given change.

### The hook

At run time, your application needs to be able to easily figure out where assets are located. For this reason, cartero provides a small ([< 100 LOC](https://github.com/rotundasoftware/cartero-node-hook/blob/master/index.js)) runtime library that your server side logic can use to look up asset urls or paths (based on a simple map output by cartero at build time). At the time of this writing, only a [hook for node.js](https://github.com/rotundasoftware/cartero-node-hook) is available, but one can quickly be written for any server side environment.

For example, if `./views/page1/index.js` is an entry point, the following call will return all the `script` and `link` tags needed to load its js and css bundles:

```javascript
h.getTagsForEntryPoint( 'views/page1/index.js', function( err, scriptTags, styleTags ) {
  // scriptTags and styleTags and strings of <script> and <link> tags, respectively.

  // attach the tags to the express res.locals so we can
  // output them in our template to load the page's assets
  res.locals.script = scriptTags;
  res.locals.style = styleTags;
} );
```

You can also ask the cartero hook to lookup the url of a specific asset. For example, to find the url of `carnes.png` in that same page1 directory.


```javascript
h.getAssetUrl( 'views/page1/carnes.png' ), function( err, url ) {
  res.locals.imgUrl = url;
} );
```

## It's in the package.json

cartero can gather and compile style and image assets from any module with a `package.json` file. Just include a `style` and / or `image` property in the `package.json` that enumerates the assets the package requires of that type (in [glob notation](https://github.com/isaacs/node-glob#glob-primer)). For example,

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

The CommonJS `require( 'modules' )` syntax is used to require a package, along with all its css and other assets. The argument to `require` is resolved resolved by [browserify](http://browserify.org/) using the [node resolve algorthim](https://github.com/substack/node-resolve).

Note that `package.json` files can be in any location. You can even put package.json in your `views` folder. Sound weird? Try it. The JavaScript entry point that is used by any given view is, after all, just like a package -- it has its own js, css, and may depend on other packages (or even be depended upon). Does this look weird?


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
    │   ├── page1.jade        /* server side template */
    │   ├── style.css
    │   └── index.js          /* entry point for page 1 */
    └── page2
        ├── package.json
        ├── style.css
        ├── page2.jade        /* server side template */
        └── index.js          /* entry point for page 2 */
```

## Usage

```
$ npm install -g cartero
$ cartero <entryPoints> <outputDir> [options]
```

The `cartero` command gathers up all assets required by the JavaScript files matching the `<entryPoints>` argument, transforms and concatinates them as appropriate, and saves the output in `outputDir`.

At run time, the HTML tags needed to load a parcel's js and css bundles, as well as its other assets, can be found using the [cartero hook's](https://github.com/rotundasoftware/cartero-node-hook). The [cartero express middleware](https://github.com/rotundasoftware/cartero-express-middleware) can be used for an added level of convenience.

## Command line options

```
--transform, -t         Name or path of a application level transform. (See discussion of `appTransforms` option.)

--transformDir, -d      Path of an application transform directory. (See discussion of application transforms.)

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

You can apply transforms to all packages within an entire branch of the directory tree using the `appTransforms` and `appTransformDirs` options or their corresponding command line arguments. (Packages inside a `node_modules` folder located inside one of the supplied directories are not effected.) For example, to transform all sass files inside the views directory to css,

```
$ cartero views/**/index.js static/assets -t sass-css-stream -d ./views
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

The same resolution algorithm can be employed at run time (on the server side) via the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook) using the `getAssetUrl` method.

## API

### c = cartero( entryPoints, outputDir, [options] )

`entryPoints` is a glob pattern, or an array of glob patterns. Any JavaScript file matching the pattern(s) will be treated as an entry points. `outputDir` is the path of the directory into which all of your processed assets will be dropped (along with some meta data). It should be a directory that is exposed to the public so assets can be loaded using script / link tags (e.g. the `static` directory in express applications). Options are as follows:

* `assetTypes` (default: [ 'style', 'image' ]) - The keys in package.json files that enumerate assets that should be copied to the cartero output directory.
* `assetTypesToConcatenate` (default: [ 'style' ]) - A subset of `assetTypes` that should be concatenated into bundles. Note JavaScript files are special cased and are always both included and bundled (by browserify).
* `outputDirUrl` (default: '/') - The base url of the output directory.
* `appRootDir` (default: undefined) - The root directory of your application. (You generally only need to supply this option if the directory structure of the system on which your application will be run is different than of the system on which cartero is being run.)
* `appTransforms` (default: undefined) - An array of [transform modules](https://github.com/substack/module-deps#transforms) names / paths or functions to be applied to all packages in directories in the `appTransformDirs` array.
* `appTransformDirs` (default: undefined) - `appTransforms` are applied to any packages that are within one of the directories in this array. (The recursive search is stopped on `node_module` directories.)
* `packageTransform` (default: undefined) - A function that transforms package.json files before they are used. The function should be of the signature `function( pkgJson, pkgPath )` and return the parsed, transformed package object. This feature can be used to add default values to package.json files or alter the package.json of third party modules without modifying them directly.
* `sourceMaps` (default: false) - Enable js source maps (passed through to browserify).
* `watch` (default: false) - Reprocess assets and bundles (and meta data) when things change.
* `postProcessors` (default: []) - An array of post-procesor functions or module names / paths. Post-processors should have the same signature as [transform modules](https://github.com/substack/module-deps#transforms).

A cartero object is returned, which is an event emitter.

#### c.on( 'done', function(){} );
Called when all assets and meta data has been written to the destination directory.

#### c.on( 'error', function( err ){} );
Called when an error occurs.

#### c.on( 'browserifyInstanceCreated', function( browserifyInstance ) );
Called when the browserify / watchify instance is created.

#### c.on( 'fileWritten', function( path, assetType, isBundle, watchModeUpdate ){} );
Called when an asset or bundle has been written to disk. `watchModeUpdate` is true iff the write is a result of a change in watch mode.

#### c.on( 'packageCreated', function( package ){} );
Called when a new [parcelify](https://github.com/rotundasoftware/parcelify) package is created.

## FAQ

#### Q: What is the best way to handle client side templates?

Use a browserify transform like [nunjucksify](https://github.com/rotundasoftware/nunjucksify) or [node-hbsfy](https://github.com/epeli/node-hbsfy) to precompile templates and `require` them explicitly from your JavaScript files.

#### Q: What does cartero write to the output directory?

You generally don't need to know the anatomy of cartero's output directory, since the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook) serves as a wrapper for the information and assets in contains, but here is the lay of the land for the curious. Note the internals of the output directory are not part of the public API and may be subject to change.

```
├── static
│   └── assets                                                              /* output directory */
│       ├── 66e20e747e10ccdb653dadd2f6bf05ba01df792b                        /* entry point package directory */
│       │   ├── assets.json
│       │   ├── page1_bundle_14d030e0e64ea9a1fced71e9da118cb29caa6676.js
│       │   └── page1_bundle_da3d062d2f431a76824e044a5f153520dad4c697.css
│       ├── 880d74a4a4bec129ed8a80ca1f717fde25ce3932                        /* entry point package directory */
│       │   ├── assets.json
│       │   ├── page2_bundle_182694e4a327db0056cfead31f2396287b7d4544.css
│       │   └── page2_bundle_5066f9594b8be17fd6360e23df52ffe750206020.js
│       ├── 9d82ba90fa7a400360054671ea26bfc03a7338bf                        /* regular package directory */
│       │   └── robot.png
│       └── metaData.json
```

* Each subdirectory in the output directory
  * corresponds to a particular package (some of which are entry points),
  * is named using that package's unique id,
  * contains all the assets specific to that package, and
  * has the same directory structure as the original package.
* Directories that coorespond to entry points also contain an `assets.json` file, which enumerates the assets used by the entry point.
* The `metaData.json` file maps package paths to package ids.

#### Q: Is it safe to let browsers cache asset bundles?

Yes. The name of asset bundles generated by cartero includes an shasum of their contents. When the contents of one of the files changes, its name will be updated, which will cause browsers to request a new copy of the content. (The [Rails Asset Pipeline](http://guides.rubyonrails.org/asset_pipeline.html) implements the same cache busting technique.)

#### Q: Will relative urls in css files break when cartero bundles them into one file?

Well, they would break, but cartero automatically applies a tranform to all your style assets that replaces relative urls with absolute urls, calculated using the `outputDirUrl` option. So no, they won't break.

## Contributers

* [David Beck](https://twitter.com/davegbeck)
* [James Halliday](https://twitter.com/substack)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
