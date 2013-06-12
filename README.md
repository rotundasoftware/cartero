<p align="center">
  <img src="http://www.rotundasoftware.com/images/cartero.png"/>
</p>
Cartero is a client side asset manager, especially suited for organizing, processing, and serving the many JavaScript, stylesheet, and template assets needed in "thick client" web applications built with JavaScript MVC frameworks.

As of the time of this writing Cartero is available only for Node.js / Express, but only a small part of Cartero is web-framework specific, and it is designed to be easy to port to any environment.

## Benefits

* Instead of using separate directories for each type of asset, group your assets into "bundles" of related JavaScript files, stylesheets, templates, and images (e.g. keep `person.coffee`, `person.scss`, `person.tmpl` together in *one directory*).
* Specify the exact bundles that are required for each page in the page's template.
* Easily manage bundle dependencies.
* All assets that a page requires are automatically injected into the served HTML when the page's template is rendered. No more messing with `<script>` and `<link>` tags!
	* In development mode, served assets are preprocessed, but not minified or concatenated.
	* In production mode, served assets are preprocessed, minified and concatenated.
* All assets that live in the same directory as a page's template are automatically included when that page is rendered.
* Use your preferred JavaScript module system (e.g. RequireJS, [Marionette](https://github.com/marionettejs/backbone.marionette) Modules, etc.). If you'd like, even enjoy built in support for client side CommonJS style modules via [Browserify](https://github.com/substack/node-browserify)!
* Easily run any and all of your favorite preprocessing and minification tasks (scss, coffee, uglify, etc.).

## Overview

### The Asset Library

Get ready for a slight paradigm shift from the traditional js / css / template directory structure. With Cartero, you can keep all your assets, regardless of type, in your application's **_Asset Library_** (except for assets that are just used by a particular page, which can be stored with that page's template - see below). Each subdirectory of your Asset Library defines a **_Bundle_** that may contain JavaScript files, stylesheets, templates, and images. Additionally, each bundle may contain a `bundle.json` file, which contains meta-data about that bundle, such as any dependencies on other bundles. For example, take the following example library.

```
assetLibrary/
	JQuery/
		jquery.js
	JQueryUI/
		bundle.json = { dependencies : [ "JQuery" ] }
		jquery-ui.js
		jquery-ui.css
	Backbone/
		bundle.json = { dependencies : [ "JQuery" ] }
		backbone.js
	Dialogs/
		bundle.json = { dependencies : [ "Backbone", "JQueryUI" ] }
		dialogManager.coffee
	EditPersonDialog/
		bundle.json = { dependencies : [ "Dialogs" ] }
		editPersonDialog.coffee
		editPersonDialog.scss
		editPersonDialog.tmpl
```

Because of the `bundle.json` files (contents inlined), the `EditPersonDialog` bundle depends on the `Dialogs` bundle, and indirectly depends on the other three bundles. When a page requires a bundle, dependencies are automatically resolved.

It is also possible to implicitly declare dependencies by nesting bundles because, by default, child bundles automatically depend on their parent bundles. For example, we can put the `EditPersonDialog` bundle inside the `Dialogs` bundle, like so:

```
assetLibrary/
	JQuery/
		jquery.js
	JQueryUI/
		bundle.json = { dependencies : [ "JQuery" ] }
		jquery-ui.js
		jquery-ui.css
	Backbone/
		bundle.json = { dependencies : [ "JQuery" ] }
		backbone.js
	Dialogs/
		bundle.json = { dependencies : [ "Backbone", "JQueryUI" ] }
		dialogManager.coffee
		EditPersonDialog/
			editPersonDialog.coffee
			editPersonDialog.scss
			editPersonDialog.tmpl
```

Now the bundle named `Dialogs/EditPersonDialog` depends on on the `Dialogs` bundle (and indirectly depends on the other three bundles) by virtue of the directory structure.

### Page specific assets

In addition to the assets in bundles that are required by a page, the assets that live in the same directory as a page's server side template will automatically be included when it is rendered. For example, say your page templates live in a directory named `views`, as is typical for most web frameworks.

```
views/
	login/
		login.jade
		login.coffee
		login.scss
	peopleList/
		peopleList.jade
		peopleList.coffee
		peopleList.scss
```

When the `login.jade` template is rendered, the `login.coffee` and `login.scss` assets will automatically be injected into the HTML of the page, as will the `peopleList.*` assets when the `peopleList.jade` template is rendered.

## How it works

### The Cartero Grunt Task

The heart of Cartero is an intelligent [Grunt.js](http://gruntjs.com/) task that glues together other Grunt.js tasks. You configure and call the **_Cartero Grunt Task_** from your application's gruntfile. You specify exactly which preprocessing and minification tasks your application needs, and those tasks are then called by the Cartero task at the appropriate times. After the Cartero task is finished, all of your assets will be preprocessed, and, in production mode, concatenated and minified. Additionally, the Cartero task generates a `cartero.json` file that [enumerates the assets](#carteroJson) required for each of your page templates.

### The Hook

There is also a very small but important piece of logic for serving up assets and injecting them into rendered HTML, called the **_Hook_**. The Hook needs to reside in your web application framework, since it is used at the time your templates are rendered. Currently there is a Hook available only for Node.js / Express, but there is minimal logic involved and it is easy to implement in any environment. Each time you render a template, the Hook is used to look up the template in the `cartero.json` file generated by the Cartero Grunt Task, and place raw HTML into three variables that are exposed to the template:

`cartero_js` - the raw HTML of the `<script>` elements that load all the required JavaScript files.

`cartero_css` - the raw HTML of the `<link>` elements that load all the required CSS files.

`cartero_tmpl` - the raw, concatenated contents of all the required client side template files.

You may then output the contents of those variables in the appropriate places in your template just like any other template variable. For example, if you are using Jade templates, your page structure might look something like this:

```jade
// page layout
doctype 5
html(lang="en")
	head
		title myPage
		| !{cartero_js}
		| !{cartero_css} 
	body
		| !{cartero_tmpl} 
		h1 Hello World
```

## Getting started

First, install Cartero via npm:

```
npm install cartero
```

Now configure the Cartero Grunt Task in your applcation's gruntfile. (If you haven't used Grunt before, check out the [Getting Started](http://gruntjs.com/getting-started) guide.) Here is the minimal gruntfile configuration that is required to run the Cartero Grunt Task:

```
// example gruntfile

module.exports = function( grunt ) {
	grunt.initConfig( {
		cartero : {
			options : {
				projectDir : __dirname,
				library : {
					path : "assetLibrary/"
				},
				views : {
					path : "views/",
					viewFileExt : ".jade"
				}
				publicDir : "static/"
				mode : "dev"
			}

			// `dev` target uses all the default options
			dev : {},			

			// `prod` target overrides the `mode` option
			prod : {
				options : {
					mode : "prod"
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-cartero" );
};
```

The five required options for the Cartero Grunt Task are `projectDir`, `library`, `views`, `publicDir`, and `mode`.

The `projectDir` option specifices the root folder for your project. *All other paths in the gruntfile should be relative to this directory.* The `library` option specifies the path(s) to your Asset Library directory(ies), and the `views` option specifies the directory(ies) that contains your server side view templates. The `publicDir` option tells Cartero where your application's "public" folder is located (generally the "static" folder in Node.js / Express apps). (Cartero will automatically create two directories within `publicDir` into which processed assets will be dumped, `library-assets` and `view-assets`, containing assets that pertain to bundles and page views, respectively).

The Cartero Grunt Task also takes options that allow you to call arbitrary preprocessing and minification tasks (to compile .scss, uglify JavaScript, etc.). See the [reference section](#reference) for a complete list of options for the Cartero task.

Once you have configured the Cartero Grunt Task, you need to configure the Hook in your web framework. As of this writing there is only a Hook available for Node.js / Express, which is implemented as Express middleware. You just need to install the middleware, passing it the path of your project directory (i.e. the `projectDir` option from the gruntfile configuration).

```javascript
// app.js

var app = express();
var carteroHook = require( "cartero/middleware" ),
// ...

app.configure( function() {
	app.set( "port" , process.env.PORT || 3000 );
	app.set( "views" , path.join( __dirname, "views" ) );
	app.use( express.static( path.join( __dirname, "static" ) ) );
	// ...
	app.use( carteroHook( __dirname ) );	// install the Cartero Hook
} );
```

Now you are ready to go. To let Cartero know which asset bundles are required by which pages, you use **_Directives_**. The Cartero Grunt Task scans your page template files for these Directives, which have the form `##cartero_xyz`. The `##cartero_requires` Directive is used to declare dependencies:

```jade
// peopleList.jade

// ##cartero_requires "JQuery", "Dialogs/EditPersonDialog"

doctype 5
html(lang="en")
	head
		title login
		| !{cartero_js}
		| !{cartero_css} 
	body
		| !{cartero_tmpl} 
		h1 People List
		// ...
```

When you run either of the following commands from the directory of your gruntfile:

	grunt cartero:dev
	grunt cartero:prod

The Cartero Grunt Task will fire up, preprocess all of your assets, and put the `cartero.json` file used by the Hook in your project folder. In `dev` mode, the Cartero Grunt Task will automatically watch all of your assets for changes and reprocess them as needed. In `prod` mode, the task will terminate after minifying and concatenating your assets. In either case, when you load a page, the three variables `cartero_js`, `cartero_css`, and `cartero_tmpl` with be available to the page's template, and will contain all the raw HTML necessary to load the assets for the page.

## <a id="reference"></a>Reference

### Cartero Grunt Task Options

```javascript
options : {
	// (required) The root directory for the project. ALL OTHER PATHS IN THE REMAINDER
	// OF THESE OPTIONS SHOULD BE RELATIVE TO THIS DIRECTORY.
	"projectDir" : __dirname,

	// (required) An object that specifies your Asset Library directory and related options. 
	// You may also supply an array of objects, instead of just one object, if you have multiple
	// directories that contain bundles. For example, if you are using Bower, you will likely
	// want to include both the "components" directory and an application specific directory
	// in your Asset Library, so the library option would be an array of two objects.
	"library" : {
		// (required) The path to the directory containing asset bundles.
		path : "assetLibrary/",

		// (default: true) When true, parent bundles are automatically added as a
		// dependency to their children. For example, the `Dialogs/EditPersonDialog`
		// bundle would automatically depend on the `Dialogs` bundle, with no need
		// to explicitly declare the dependency.
		childrenDependOnParents : true,

		// (default: /^_.*/) Files contained in directories with names matching this regular
		// expression will be treated as part of the parent directory. This feature 
		// enables you to use directories within a bundle for organizational purposes,
		// when otherwise they would be considered their own bundles.
		directoriesToFlatten : /^_.*/,

		// (default: undefined) If you can't, or would rather not, define your bundle
		// properties in `bundle.json` files that live in each bundle's directory, you can
		// define your bundle properties using this option. For instance, if you are using
		// Bower, you are not allowed to modify the contents of its `components` directory, so
		// you can use this option to provide bundle meta-data instead of `bundle.json` files.
		// This option expects a hash that maps bundle names to bundle meta-data objects,
		// as described below in the bundle.json reference section.
		bundleProperties : grunt.file.readJSON( "bundleProperties.json" ),

		// (default: undefined) If your Asset Library has multiple directories, you
		// may supply this property to give this directory a unique "namespace". For
		// example, if your Asset Library is composed of Bower's "components" directory 
		// and your own "assetLibrary" directory, you might give the "components" directory
		// the "Bower" namespace. Bundles in that directory would then be referenced by 
		// pre-pending `Bower/` to their name.
		namespace : "App"
	},

	// (required) An object that specifies your views directory and related options.
	// As with the `library` option, you may supply an array of objects, instead
	// of just one object, if you have multiple directories that contain views.
	"views" : {
		// (required) The path to the directory containing your server side view templates.
		// Generally this directory is called "views" in the Node.js / Express world.
		path : "views/",

		// (required) The file extension of your server side template files (e.g. ".nunjucks"
		// ".erb", ".twig", etc.). Files that match this extension are scanned for the
		// ##cartero_requires directive (see below discussion of directives for more info).
		viewFileExt : ".jade",

		// (default: /^_.*/) Files with names matching this regular expression
		// will be completely ignored by Cartero.
		filesToIgnore : /^_.*/,

		// (default: /^__.*/) Directories with names matching this regular expression
		// will be completely ignored by Cartero.
		directoriesToIgnore : /^__.*/,

		// (default: /^_.*/) Behaves exactly as its counterpart in the `library` option.
		// Assets in flattened directories are served with a server side template when
		// it is rendered, just as if they lived in the template's directory.
		directoriesToFlatten : /^_.*/,

		// (default: undefined) Analogous to its counterpart in the `library` option.
		namespace : "Main"
	}

	// (required) The "public" directory of your application, that is, the directory that
	// is served by your web server. In Node.js / Express applications this is generally the
	// "static" directory. Like all paths in these options, it should be relative to `projectDir`.
	"publicDir" : "static/",

	// (required) Either "dev" or "prod". In "dev" mode a) the `minificationTasks` are not run
	// b) assets are not concatenated, and c) after finishing, the Cartero Grunt Task will
	// automatically watch all of your assets for changes and reprocess them as needed.
	"mode" : "dev",

	// (default: undefined) An array of "preprocessing tasks" to be performed on your assets,
	// such as compiling scss or coffee. You may include an entry for any task in this array, AS
	// LONG AS THE TASK IS AVAILABLE AND REGISTERED using `grunt.loadNpmTasks` (just as if you were 
	// to run the task yourself from your gruntfile). The task will be run on all files with the
	// `inExt` file extension, and will change processed files to have the `outExt` extension, if
	// provided. You can also provide an `options` property that will be forwarded to the task.
	"preprocessingTasks" : [ {
		name : "coffee",
		inExt : ".coffee",
		outExt : ".js",
		options : {
			sourceMap : true
		}
	}, {
		name : "sass",
		inExt : ".scss",
		outExt : ".css"
	} ],

	// (default: undefined) An array of "minification tasks" to be performed on your assets
	// *in prod mode only*, such as minifying CSS or JavaScript. This option is structured
	// just like the `preprocessingTasks` option.
	"minificationTasks" : [ {
		name : "htmlmin",
		inExt : ".tmpl",
		options : {
			removeComments : true
		}
	}, {
		name : "uglify",
		inExt : ".js",
		options : {
			mangle : false
		}
	} ],

	// (default: false) Cartero includes built in support for CommonJS style modules thanks
	// to Browserify. Set this option to `true` to automatically "browserify" your files.
	// (Also please see the `##cartero_browserify_executeOnLoad` directive below for important
	// information on using this option.) 
	browserify : true
}
```

### Properties of bundle.json 

Each of your bundles may contain a `bundle.json` file that specifies meta-data about the bundle, such as dependencies. (Note: An actual bundle.json file, since it is simple JSON, can not contain JavaScript comments, as does the example.)

```javascript
// Sample bundle.json file
{
	// (default: undefined) An array of bundles that this bundle depends on.
	"dependencies" : [ "JQuery" ],

	// (default: undefined) An array of file names within the bundle. Files in this
	// array will be served before any other files in the bundle, in the order they
	// appear in the array.
	"filePriority" : [ "backbone.js" ],

	// (default: undefined) A an array of directories that overrides the corresponding  
	// property in the `library` option of the Cartero GruntTask for this bundle only.
	"directoriesToFlatten" : [ "mixins" ],

	// (default: false) If true, assets in flattened subdirectories are served before
	// assets in the root directory of the bundle. Otherwise, they are served after.
	"prioritizeFlattenedDirectories" : false,

	// (default: false) This option can be used to compile separate combined asset files
	// for this bundle in `prod` mode, instead of lumping them all together with rest of the
	// concatenated assets for the page being served. It is useful for optimizing page load
	// time. Large libraries like jQueryUI, for example, can be set as keepSeparate, so that
	// they are loaded in parallel with the rest of your assets, and so that browsers
	// can cache them between page loads. Note that setting this property to `true` does not
	// guarantee that this bundle's files will *always* be kept totally separate. Under some 
	// circumstances it is not possible to keep the files separate while honoring the 
	// order in which assets should be served (e.g. when several `keepSeperate` bundles 
	// depend on a not `keepSeperate` bundle). In these cases, the bundles files are 
	// kept "as separate as possible" - trust us, we did think it through.
	"keepSeparate" : true,

	// (default: undefined) An array of files that will only be served in dev mode, and
	// that will be ignored in prod mode.
	"devModeOnlyFiles" : [ "backbone.js" ],

	// (default: undefined) An array of files that will only be served in prod mode, and
	// that will be ignored in dev mode.
	"prodModeOnlyFiles" : [ "backbone.min.js" ],

	// (default: undefined) An array of files that should be included when the bundle is
	// sourced (i.e. copied to the public folder), but that should not be concatenated with
	// any other assets or served by the Hook. This feature allows you to accommodate
	// ".css" or ".js" files that are "dynamically loaded" after the initial page load.
	"dynamicallyLoadedFiles" : [ "ie-8.css" ],

	// Only used when the `browserify` option in the Cartero Grunk Task is enabled, this
	// property is an array of JavaScript files that should be executed as soon as they
	// are loaded in the client. Files that are not included in this property will not
	// be executed until they are `require`d by another file.
	"browserify_executeOnLoad" : [ "backbone.js" ]
}
```

### Directives

#### ##cartero_requires *bundleName_1, [ bundleName_2, ... ]*

This Directive is used in server side templates to specify which bundles they require. Bundles are referred to by their name, which is the full path of their folder, relative to the Asset Library directory in which they reside. If the Asset Library directory has a `namespace` property, that namespace is pre-pended to the bundle name. Generally you will want to enclose the Directive in the "comment" escape sequence for whatever template language you are using.

```html
<!-- ##cartero_requires "Bower/jQuery", "App/Dialogs/EditPersonDialog" -->
```

#### ##cartero_extends *parentView*

This Directive is used in server side templates to specify that one template "inherits" the required bundles of another. It is analogous to the "extends" feature offered by [nunjucks](http://nunjucks.jlongster.com/), [Jade](http://jade-lang.com/), [Twig](http://twig.sensiolabs.org/), and other popular server side templating languages. Using this directive is equivalent to inlining the `##cartero_requires` directive from the *parentView*. *parentView* must be a path relative to the view directory (pre-pended with the view directory's `namespace`, if it has one). 

```html
<!-- ##cartero_extends "layouts/site_layout.twig" -->
```

#### ##cartero_dir

When your assets are processed, this Directive is replaced with the path of the directory in which it appears. It is similar in concept to the node.js global `__dirname`, but the path it evaluates to is relative to your application's `publicDir`.

```javascript
var myDirName = "##cartero_dir";
```

It can be used in any type of asset processed by Cartero, including client side template files.

```
<script type="text/template" id="##cartero_dir">
	...
</script>
```

#### ##cartero_browserify_executeOnLoad

When the `browserify` option in the Cartero Grunk Task is enabled, this directive is used in JavaScript files to specify that they should be automatically executed when they are loaded. You will definitely want to include this directive in your "main" JavaScript files for each page, since otherwise they would never be executed!

## FAQ

#### Does Cartero work with Rails, PHP, etc., or just with Node.js / Express?

The heart of Cartero is an intelligent Grunt.js task, and can be used with any web framework. However, there is a small piece of logic called the Hook which must be called from your web framework, since it is used when each page is rendered. If you are interested in developing a Cartero Hook for your web framework of choice, keep reading - it's not hard.

From a high level perspective, the Hook is responsible for populating the `cartero_js`, `cartero_css`, and `cartero_tmpl` variables and making them available to the template being rendered. The implementation details are somewhat dependent on your web framework, but the general idea will always be similar.

* When the Hook is configured or initialized, it should be passed the absolute path of your `projectDir`.
* The Hook needs to be called before your web framework's "render" function to set the value of the three template variables for which it is responsible. It should be passed the absolute path of the template file being rendered.
* The Hook uses the `cartero.json` file that was generated by the Cartero Grunt Task, located in the `projectDir`, to lookup the assets needed for the template being rendered. The `cartero.json` file has the following format. *All paths in the file are relative to `projectDir`.*
<a href=#carteroJson></a>
```javascript
// Sample catero.json file
{
	mode : "dev",

	// the relative path of the `publicDir`
	publicDir : "static",

	parcels : {
		// A template's "parcel" is the collection of assets required when it is rendered. Parcels 
		// are named using the relative path of their corresponding template file.
		"views/peopleList/peopleList.jade" : {

			// `js`, `css`, and `tmpl` are arrays of the relative paths of the assets in this parcel.

			js : [
				"static/library-assets/JQuery/jquery.js",
				"static/library-assets/JQueryUI/jquery-ui.js",
				// ...
				"static/view-assets/peopleList/peopleList.js"
			],

			css : [
				"static/library-assets/JQueryUI/jquery-ui.css",
				// ...
				"static/view-assets/peopleList/peopleList.css"
			],

			tmpl : [
				"static/library-assets/Dialogs/EditPersonDialog/editPersonDialog.tmpl"
			]
		},

		// ...
	}
}
```

The format of this file is exactly the same in `dev` and `prod` mode, but `prod` mode the assets will be minified and concatenated.

The Hook then generates the raw HTML that will include the assets in the page being rendered and puts it into the `cartero_js`, `cartero_css`, and `cartero_tmpl` template variables. For the case of `js` and `css` files, it just needs to transform the paths in the `cartero.json` file to be relative to the `publicDir`, and then wrap them in `<script>` or `<link>` tags. For `tmpl` assets, the Hook needs to read the files, concatenate their contents, and then put the whole shebang into `cartero_tmpl`.

#### Does Cartero address the issue of cache busting?

Yes. The name of the concatenated asset files generated in `prod` mode includes an MD5 digest of their contents. When the contents of one of the files changes, its name will be updated, which will cause browsers to request a new copy of the content. The [Rails Asset Pipeline](http://guides.rubyonrails.org/asset_pipeline.html) implements the same cache busting technique.

#### Since Cartero combines files in `prod` mode, won't file (image) urls used in my stylesheets break?

Yes and No. They would break, but Cartero automatically scans your `.css` files for `url()` statements, and fixes their arguments so that they don't break.

## Cartero Hook Directory

* Node.js / Express
	* [caretro-express-hook](https://github.com/rotundasoftware/cartero-express-hook)

If you develop a Hook for your web framework, please let us know and we'll add it to the directory.