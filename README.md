<h1>Cartero</h1>

In the year 2013, why do we still organize our web assets like it's 1990, grouping them together in big directories separated by their type? Instead, why don't we leverage directories more effectively to put files together that really belong together? For example, why don't we put JavaScript and stylesheet assets that are just used by one particular page in the same directory as that page's template? And what about closely related assets like personModel.js, personView.js, person.css, etc.? Why don't we keep those together in a single "person" directory, instead of spreading them out all over the place? It sure would be nice to be able to quickly switch between "person" files just by clicking on another file in the same directory! And it sure would be nice to "require" all the "person" assets just by referencing the "person" directory, instead of each individual asset!

One of the obstacles has been that asset management has a lot of moving parts. A complete general solution needs to address preprocessing (i.e. compiling .scss, .coffee, etc.) for arbitrary asset types, minification and concatenation in production mode, and dependency management.

Cartero works on top of [Grunt.js](http://gruntjs.com/) and optionally together with [Bower](http://bower.io/), addressing these issues so that we can more effectively organize assets, optimize their delivery, and scale up applications.

<p align="center">
	<img src="http://www.rotundasoftware.com/images/cartero/combo-directory-structure.png" />
</p>

* Group your assets into "bundles" of related JavaScript files, stylesheets, templates, and even images. Then just specify the bundles that each page requires.
* Keep assets for a particular page with that page's template to automatically serve them with the page.
* All necessary `<script>` and `<link>` tags are generated for you.
	* Bundle dependencies (and inter-bundle dependencies) are resolved.
	* In development mode, served assets are preprocessed, but not minified or concatenated.
	* In production mode, served assets are preprocessed, minified and concatenated.
		* Large asset bundles can optionally be kept separate for optimal loading and caching.
* Use your preferred JavaScript module system, e.g. RequireJS, [Marionette Modules](https://github.com/marionettejs/backbone.marionette/blob/master/docs/marionette.application.module.md), or even CommonJS!
* Integrates with [Bower](http://bower.io/), automatically resolving dependencies in `bower.json` files.

Cartero is JavaScript framework, stylesheet and templating language agnostic. It also *almost* works with any web framework &ndash; the [very small "hook"](https://github.com/rotundasoftware/cartero-express-hook/blob/master/middleware.js) of runtime logic is easy to port to any web framework, but is currently only available for Node.js / Express. Instructions for writing a Hook for another framework <a href="#hook">are below</a>.

## Overview

### The Asset Library

Keep all your assets, regardless of type, in your application's Asset Library (except for assets that are just used by a particular page, which can be stored with that page's template - see below). Each subdirectory of your Asset Library defines a Bundle that may contain JavaScript files, stylesheets, templates, and images.

```
assetLibrary/
    dialogs/
        dialogManager.coffee
    editPersonDialog/
        bundle.json = { dependencies : [ "dialogs" ] }
        editPersonDialog.coffee
        editPersonDialog.scss
        editPersonDialog.tmpl
```

Here, the `editPersonDialog` bundle depends on the `dialogs` bundle because of its `bundle.json` file (contents inlined). Dependencies (and other bundle meta-data) can be specified either in `bundle.json` files that live in bundle directories themselves, in an external bundle meta-data file, or implicitly through the directory structure (see  the `childrenDependOnParents` option).

### Page specific assets

Keep assets that are just used by one particular page in the same directory as the page's template, and they will be automatically be included when it is rendered. No more messing with `<script>` and `<link>` tags! For example, say your page templates live in a directory named `views`:

```
views/
	login/
		login.jade
		login.coffee
		login.scss
```

When the `login.jade` template is rendered, the compiled `login.coffee` and `login.scss` assets will automatically be included. A page can also "extend" on the assets required by another page.

### Using Cartero with Bower

The Bower `components` directory can also be used as an Asset Library, for example:

```
app/
    dialogs/
        bundle.json = { dependencies : [ "components/jquery-ui" ] }    	
        dialogManager.coffee
    editPersonDialog/
        bundle.json = { dependencies : [ "app/dialogs" ] }
        editPersonDialog.coffee
        editPersonDialog.scss
        editPersonDialog.tmpl
components/
	jquery-ui
        bower.json = { "dependencies": { "jquery": "~> 1.10.1" }, ... }
		...
	jquery
		...
```

Bower dependencies are automatically resolved, so when the `app/editPersonDialog` bundle is required by a page, the `components/jquery-ui` and `components/jquery` bundles will also be included automatically. Note that since Bower packages generally contain extra files like unit tests, you also need to tell Cartero which assets from each Bower package should be used with the `whitelistedFiles` option. Also, you'll want to set the `allowNestedBundles` flag to `false` for the `components` directory, since the Bower namespace is flat.

## Getting started

First, install Cartero via npm:

	npm install cartero

Now configure the Cartero Grunt Task in your applcation's gruntfile. (If you haven't used Grunt before, [read this](http://gruntjs.com/getting-started).) Here is the minimal configuration that is required to run the Cartero Grunt Task (all options shown are required):

```javascript
// example gruntfile

module.exports = function( grunt ) {
	grunt.initConfig( {
		cartero : {
			options : {
				projectDir : __dirname,	     // the root directory of your project. All other paths 
										     // in these options are relative to this directory.
				library : {
					path : "assetLibrary/"   // the relative path to your Asset Library directory.
				},
				views : {
					path : "views/",  	 	 // the directoy containing your server side templates.
					viewFileExt : ".jade" 	 // the file extension of your server side templates.
				}
				publicDir : "static/",	  	 // your app's "public" or "static" directory (into
										  	 // which processed assets will ultimately be dumped).

				tmplExt : ".tmpl",			 // the file extension(s) of your client side template.
				mode : "dev"			  	 // "dev" or "prod"
			}

			// `dev` target uses all the default options.
			dev : {},			

			// `prod` target overrides the `mode` option.
			prod : {
				options : {
					mode : "prod"
				}
			}
		}
	} );

	grunt.loadNpmTasks( "cartero" );
	grunt.loadNpmTasks( "grunt-contrib-watch" ); // for `--watch` flag
};
```

The Cartero Grunt Task also takes options that allow you to call arbitrary preprocessing and minification tasks (to compile .scss, uglify JavaScript, etc.), and more. See the [reference section](#reference) for a complete list of options for the Cartero task.

Once you have configured the Cartero Grunt Task, you need to configure the **_Hook_** in your web framework. The Hook is a small piece of runtime logic that resides in your web application framework. It uses [the output](#carteroJson) of the Cartero Grunt Task to provide your application with the raw HTML that loads the assets on each page. As of this writing there is only a Hook available for Node.js / Express, which is implemented as Express middleware. To install it, run:

	npm install cartero-express-hook

Then `use` it, passing the absolute path of your project directory (i.e. the `projectDir` option from the gruntfile configuration).

```javascript
// app.js

var app = express();
var carteroMiddleware = require( "cartero-express-hook" );
// ...

app.configure( function() {
	app.set( "port" , process.env.PORT || 3000 );
	app.set( "views" , path.join( __dirname, "views" ) );
	app.use( express.static( path.join( __dirname, "static" ) ) );
	// ...
	app.use( carteroMiddleware( __dirname ) );	// install the Cartero Hook
} );
```

Now you are ready to go. To let Cartero know which asset bundles are required by which pages, you use **_Directives_**. The Cartero Grunt Task scans your page template files for these Directives, which have the form `##cartero_xyz`. The `##cartero_requires` Directive is used to declare dependencies:

```jade
// peopleList.jade

// ##cartero_requires "dialogs/editPersonDialog"

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

 Notice the three variables that Cartero makes available to your template engine:

`cartero_js` - the raw HTML of the `<script>` elements that load all the required JavaScript files.

`cartero_css` - the raw HTML of the `<link>` elements that load all the required CSS files.

`cartero_tmpl` - the raw, concatenated contents of all the required client side template files.

When you run either of the following commands from the directory of your gruntfile:

	grunt cartero:dev --watch
	grunt cartero:prod

The Cartero Grunt Task will fire up, process all of your assets, and generate the output used by the Hook. The `dev` mode `--watch` flag tells the Cartero Grunt Task to watch all of your assets for changes and reprocess them as needed. In `prod` mode, the task will terminate after minifying and concatenating your assets. In either mode, when you load a page, the three variables `cartero_js`, `cartero_css`, and `cartero_tmpl` with be available to the page's template, and will contain all the raw HTML necessary to load the assets for the page.

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
	// want to include both the Bower "components" directory and an application specific 
	// directory in your Asset Library, so the library option would be an array of two objects.
	"library" : {
		// (required) The relative path to the directory containing asset bundles.
		path : "assetLibrary/",

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
		// the "components" namespace. Bundles in that directory would then be referenced by 
		// pre-pending `components/` to their name.
		namespace : "app"

		// (default: true) By default, bundles may be nested within bundles for organizational
		// purposes. For example, you might group all "control" bundles together in a single
		// directory, e.g, "ui/controls/radioGroup", "ui/controls/popupMenu", etc. When false,
		// all subdirectories of a bundle are considered part of the bundle itself. That is,
		// the asset library is a "flat" namespace, like the Github or Bower namespace.
		allowNestedBundles : true,

		// (default: /^_.*/) Only applies when allowNestedBundles is true. Files contained in
		// directories with names matching this regular expression will be treated as part of
		// the parent directory's bundle, instead of as their own bundle. The default value
		// of /^_.*/ will flatten all directories that begin with an underscore.
		directoriesToFlatten : /^_.*/,

		// (default: true) Only applies when allowNestedBundles is true. Determines whether
		// or not parent bundles are added as dependencies of their children. For example, when 
		// childrenDependOnParents is true the `dialogs/editPersonDialog` bundle would
		// automatically depend on the `dialogs` bundle.
		childrenDependOnParents : true
	},

	// (required) An object that specifies your views directory and related options.
	// As with the `library` option, you may supply an array of objects, instead
	// of just one object, if you have multiple directories that contain views.
	"views" : {
		// (required) The path to the directory containing your server side view templates.
		path : "views/",

		// (required) The file extension of your server side template files (e.g. ".nunjucks"
		// ".erb", ".twig", etc.). Files that match this extension are scanned for the
		// ##cartero_requires directive (see below discussion of directives for more info).
		viewFileExt : ".jade",

		// Files or directories with names matching these regular expressions will be
		// completely ignored by Cartero. By default no files are ignored.
		filesToIgnore : /^__.*/,			// (default: undefined)
		directoriesToIgnore : /^__.*/,		// (default: undefined)

		// (default: /^_.*/) Assets in flattened directories are served with a server side 
		// template when it is rendered, just as if they lived in the template's directory. The
		// default value of /^_.*/ will flatten all directories that begin with an underscore.
		directoriesToFlatten : /^_.*/,

		// (default: undefined) Analogous to its counterpart in the `library` option.
		namespace : "app"
	}

	// (required) The "public" directory of your application, that is, the directory that
	// is served by your web server. In Node.js / Express applications this is generally the
	// "static" directory. Cartero will automatically create directories within `publicDir` 
	// into which processed assets will be dumped, named (by default) `library-assets` and 
	// `view-assets`, containing assets that pertain to bundles and page views, respectively.
	"publicDir" : "static/",

	// (required) Either "dev" or "prod". In "dev" mode a) the `minificationTasks` are not run
	// b) assets are not concatenated, and c) if the `--watch` flag is set, after finishing, the
	// Cartero Grunt Task will watch all of your assets for changes and reprocess them as needed.
	"mode" : "dev",

	// (default: undefined) An array of "preprocessing tasks" to be performed on your assets,
	// such as compiling scss or coffee. You may include an entry for any task in this array, AS
	// LONG AS THE TASK IS AVAILABLE AND REGISTERED using `grunt.loadNpmTasks`, just as if you were 
	// to run the task yourself from your gruntfile.
	"preprocessingTasks" : [ {
		name : "coffee",		// (required) The name of the task. *The task needs to be loaded.*
		inExt : ".coffee",		// (required) The task is run on files with this file extension.
		outExt : ".js",			// (optional) A new file extension to be given to processed files.

		options : {				// (optional) An `options` object to pass on directly to the task.
			sourceMap : true	// This property can also be a function that returns an object. The
		}						// function is passed the current srcDir and destDir of the task.
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
		// no `outExt` means that processed files will still have the `.tmpl` extension
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

Each of your bundles may contain a `bundle.json` file that specifies meta-data about the bundle, such as dependencies. (Note: An actual bundle.json file, since it is simple JSON, can not contain JavaScript comments, as does the example.) By using the `bundleProperties` grunt taks option, you can alternatively specify this meta-data for all bundles in a central location.

```javascript
// Sample bundle.json file
{
	// (default: undefined) An array of bundles that this bundle depends on.
	"dependencies" : [ "JQuery" ],

	// (default: undefined) If supplied, ONLY assets listed in this array will be
	// included when this bundle is required. If not supplied, all assets are included.
	// This option is very useful when using Cartero with Bower to exclude files like
	// unit tests that should not be included in the bundle.
	"whitelistedFiles" : [ "backbone.js" ],

	// (default: undefined) Files in this array will be served before any other files
	// in the bundle, in the order they appear in the array.
	"filePriority" : [ "backbone.js" ],

	// (default: undefined) An array of directories that overrides the corresponding  
	// property in the `library` option of the Cartero Grunt Task for this bundle only.
	"directoriesToFlatten" : [ "mixins" ],

	// (default: false) If true, assets in flattened subdirectories are served before
	// assets in the root directory of the bundle. Otherwise, they are served afterwards.
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

	// (default: undefined) An array of files that will only be served in `dev` mode, and
	// that will be ignored in `prod` mode.
	"devModeOnlyFiles" : [ "mixins/backbone.subviews-debug.js" ],

	// (default: undefined) Just like `devModeOnlyFiles` but for `prod` mode.
	"prodModeOnlyFiles" : [ "mixins/backbone.subviews.js" ],

	// (default: undefined) An array of files that should be included when the bundle is
	// sourced (i.e. copied to the public folder), but that should not be concatenated with
	// any other assets or served by the Hook. This feature allows you to accommodate
	// ".css" or ".js" files that are "dynamically loaded" after the initial page load.
	"dynamicallyLoadedFiles" : [ "ie-8.css" ],

	// Only to be used when the `browserify` option in the Cartero Grunk Task is enabled, 
	// this property is an array of JavaScript files that should be executed as soon as they
	// are loaded in the client. Files that are not included in this property will not
	// be executed until they are `require`d by another file.
	"browserify_executeOnLoad" : [ "backbone.js" ]
}
```

### Directives

#### ##cartero_requires *bundleName_1, [ bundleName_2, ... ]*

This Directive is used in server side templates to specify which bundles they require. Bundles are referred to by their name, which is the full path of their folder, relative to the Asset Library directory in which they reside. If the Asset Library directory has a `namespace` property, that namespace should be pre-pended to the bundle name. Generally you will want to enclose the Directive in a "comment" block of whatever template language you are using, as shown here (.erb syntax).

```erb
<%# ##cartero_requires "app/dialogs/editPersonDialog" %>
<%# All dependencies are automatically resolved and included %>
```

#### ##cartero_extends *parentView*

This Directive is used in server side templates to specify that one template should "inherit" all of the assets of another. *parentView* must be a path relative to the view directory (pre-pended with the view directory's `namespace`, if it has one). 

```erb
<%# ##cartero_extends "layouts/site_layout.twig" %>
```

#### ##cartero_dir

When your assets are processed, this Directive is replaced with the path of the directory in which it appears. It is similar in concept to the node.js global `__dirname`, but the path it evaluates to is relative to your application's `publicDir`.

```javascript
var templateId = "##cartero_dir";
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

#### <a name="hook"></a>Q: Does Cartero work with Rails, PHP, etc., or just with Node.js / Express?

The heart of Cartero is an intelligent Grunt.js task, and can be used with any web framework. However, there is a small piece of logic called the Hook which must be called from your web framework, since it is used when each page is rendered. If you are interested in developing a Cartero Hook for your web framework of choice, keep reading - it's not hard.

From a high level perspective, the Hook is responsible for populating the `cartero_js`, `cartero_css`, and `cartero_tmpl` variables and making them available to the template being rendered. The implementation details are somewhat dependent on your web framework, but the general idea will always be similar.

* When the Hook is configured or initialized, it should be passed the absolute path of your `projectDir`.
* The Hook needs to be called before your web framework's "render" function to set the value of the three template variables for which it is responsible. It should be passed the template file being rendered.
* <a name="carteroJson"></a>The Hook uses the `cartero.json` file that was generated by the Cartero Grunt Task, located in the `projectDir`, to lookup the assets needed for the template being rendered. The `cartero.json` file has the following format. *All paths in the file are relative to `projectDir`.*

```javascript
// Sample catero.json file
{
	// the relative path of the `publicDir`
	publicDir : "static",

	parcels : {
		// A template's "parcel" is the collection of assets required when it is rendered. Parcels 
		// are named using the relative path of their corresponding template file.
		"views/peopleList/peopleList.jade" : {

			// `js`, `css`, and `tmpl` are the relative paths of the assets in this parcel.

			js : [
				"static/library-assets/jquery/jquery.js",
				"static/library-assets/jquery-ui/jquery-ui.js",
				// ...
				"static/view-assets/peopleList/peopleList.js"
			],

			css : [
				"static/library-assets/jquery-ui/jquery-ui.css",
				// ...
				"static/view-assets/peopleList/peopleList.css"
			],

			tmpl : [
				"static/library-assets/dialogs/editPersonDialog/editPersonDialog.tmpl"
			]
		},

		// ...
	}
}
```

* The Hook then generates the raw HTML that will include the assets in the page being rendered and puts it into the `cartero_js`, `cartero_css`, and `cartero_tmpl` template variables. For the case of `js` and `css` files, it just needs to transform the paths in the `cartero.json` file to be relative to the `publicDir`, and then wrap them in `<script>` or `<link>` tags. For `tmpl` assets, the Hook needs to read the files, concatenate their contents, and then put the whole shebang into `cartero_tmpl`.

#### Q: Does Cartero address the issue of cache busting?

Yes. The name of the concatenated asset files generated in `prod` mode includes an MD5 digest of their contents. When the contents of one of the files changes, its name will be updated, which will cause browsers to request a new copy of the content. The [Rails Asset Pipeline](http://guides.rubyonrails.org/asset_pipeline.html) implements the same cache busting technique.

#### Q: The "watch" task terminates on JS/CSS errors. Can I force it to keep running?

Yes. Use the Grunt `--force` flag.

	grunt cartero:dev --force --watch

#### Q: I'm getting the error: EMFILE, too many open files

EMFILE means you've reached the OS limit of concurrently open files. There isn't much we can do about it, however you can increase the limit yourself.

Add `ulimit -n [number of files]` to your .bashrc/.zshrc file to increase the soft limit.

If you reach the OS hard limit, you can follow this [StackOverflow answer](http://stackoverflow.com/questions/34588/how-do-i-change-the-number-of-open-files-limit-in-linux/34645#34645) to increase it.

#### Q: Since Cartero combines files in `prod` mode, won't image urls used in my stylesheets break?

Yes and No. They would break, but Cartero automatically scans your `.css` files for `url()` statements, and fixes their arguments so that they don't break.

## Cartero Hook Directory

* Node.js / Express: [cartero-express-hook](https://github.com/rotundasoftware/cartero-express-hook)

If you develop a Hook for your web framework, please let us know and we'll add it to the directory.

##Change Log

See the [CHANGELOG.md](CHANGELOG.md) file.
## About

By [Oleg Seletsky](https://github.com/go-oleg) and [David Beck](https://twitter.com/davegbeck).

Copyright (c) 2013 Rotunda Software, LLC.

Licensed under the MIT License.
