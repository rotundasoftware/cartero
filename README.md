<h1>Cartero</h1>

In the year 2013, why do we still organize our web assets like people did in the 90's, grouping them together by their type? Why don’t we leverage God's gift of the directory a bit more effectively to put assets together that really belong together? For example, instead of having the "person" related assets spread out all over the place  (personModel.js, personView.js, person.css, etc.), why don’t we just put all of those assets into one directory? It sure would be nice to be able to quickly switch between "person" files just by clicking on another file in the same directory! And what about assets that are used just by one particular page? Why don’t we put those assets in the same directory as the template for that page, since all those files are so closely related?

The problem has been that asset management has a lot of moving parts. A complete general solution needs to address preprocessing (i.e. compiling .scss, .coffee, etc.) for arbitrary asset types, minification and concatenation in production mode, and dependency management.

Cartero addresses these issues so that we can more effectively organize assets and scale applications.

<p align="center">
	<img src="http://www.rotundasoftware.com/images/cartero/combo-directory-structure.png" />
</p>

* Group your assets into "bundles" of related JavaScript files, stylesheets, templates, and images (e.g. `person.coffee`, `person.scss`, `person.tmpl`, etc.). Then specify the bundles that each page requires.
* Keep assets for a particular view in the view's directory to automatically include the assets with the view.
* All necessary `<script>` and `<link>` tags are generated for you. 
	* Bundle dependencies (and inter-bundle dependencies) are resolved.
	* In development mode, served assets are preprocessed, but not minified or concatenated.
	* In production mode, served assets are preprocessed, minified and concatenated.
* Use your preferred JavaScript module system, e.g. RequireJS, [Marionette](https://github.com/marionettejs/backbone.marionette) Modules, or even CommonJS!
* Include [Bower](http://bower.io/) packages as bundles.

Cartero is JavaScript framework, stylesheet and templating language agnostic. It also *almost* works with any web framework &ndash; the [very small "hook"](https://github.com/rotundasoftware/cartero-express-hook/blob/master/middleware.js) of runtime logic is easy to port to any environment, but is currently only available for Node.js / Express. Instructions for writing a Hook for another framework <a href="#hook">are below</a>.

## Overview

### The Asset Library

With Cartero, you can keep all your assets in your application's **_Asset Library_** (except for assets that are just used by a particular page, which can be stored with that page's template - see below). Each subdirectory of your Asset Library defines a **_Bundle_** that may contain JavaScript files, stylesheets, templates, and images. Additionally, each bundle may contain a `bundle.json` file, which contains meta-data about that bundle, such as any dependencies on other bundles. Take the following example library:

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

The heart of Cartero is an intelligent [Grunt.js](http://gruntjs.com/) task that ties together other Grunt.js tasks. You configure and call the **_Cartero Grunt Task_** from your application's gruntfile. You specify exactly which preprocessing and minification tasks your application needs, and those tasks are then called by the Cartero task at the appropriate times. After the Cartero task is finished, all of your assets will be preprocessed, and, in production mode, concatenated and minified. Additionally, the Cartero task generates a `cartero.json` file that [enumerates the assets](#carteroJson) required for each of your page templates.

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

	npm install cartero

Now configure the Cartero Grunt Task in your applcation's gruntfile. (If you haven't used Grunt before, [read this first](http://gruntjs.com/getting-started).) Here is the minimal configuration that is required to run the Cartero Grunt Task (all options shown are required):

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

Once you have configured the Cartero Grunt Task, you need to configure the Hook in your web framework. As of this writing there is only a Hook available for Node.js / Express, which is implemented as Express middleware. To install it, run:

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

// ##cartero_requires "Dialogs/EditPersonDialog"

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

	grunt cartero:dev --watch
	grunt cartero:prod

The Cartero Grunt Task will fire up, process all of your assets, and put the `cartero.json` file used by the Hook in your project folder. The `dev` mode `--watch` flag tells the Cartero Grunt Task to watch all of your assets for changes and reprocess them as needed. In `prod` mode, the task will terminate after minifying and concatenating your assets. In either mode, when you load a page, the three variables `cartero_js`, `cartero_css`, and `cartero_tmpl` with be available to the page's template, and will contain all the raw HTML necessary to load the assets for the page.

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
		path : "views/",

		// (required) The file extension of your server side template files (e.g. ".nunjucks"
		// ".erb", ".twig", etc.). Files that match this extension are scanned for the
		// ##cartero_requires directive (see below discussion of directives for more info).
		viewFileExt : ".jade",

		// Files or directories with names matching these regular
		// expressions will be completely ignored by Cartero.
		filesToIgnore : /^_.*/,				// (default: /^_.*/)
		directoriesToIgnore : /^__.*/,		// (default: /^__.*/)

		// (default: /^_.*/) Assets in flattened directories are served with a server side 
		// template when it is rendered, just as if they lived in the template's directory.
		directoriesToFlatten : /^_.*/,

		// (default: undefined) Analogous to its counterpart in the `library` option.
		namespace : "Main"
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
<%# ##cartero_requires "App/Dialogs/EditPersonDialog" %>
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

## About

By [Oleg Seletsky](https://github.com/go-oleg) and [David Beck](https://twitter.com/davegbeck).

Copyright (c) 2013 Rotunda Software, LLC.

Licensed under the MIT License.
