<p align="center">
  <img src="http://www.rotundasoftware.com/images/cartero.png"/>
</p>

# Cartero

Cartero is an intelligent asset manager for web applications, especially suited for organizing, processing, and serving the many assets needed in "thick client" web applications built with JavaScript MVC frameworks.

## Benefits

* Instead of using separate directories for each type of asset, group your assets into "bundles" of related javascript files, stylesheets, and templates (e.g. keep person.coffee, person.scss, person.tmpl together in one directory).
* Specify the exact bundles that are required for each page in the page's template.
* Easily manage bundle dependencies.
* All assets that a page requires are automatically injected into the served HTML when the page's template is rendered. No more messing with `<script>` and `<link>` tags!
    * In development mode, served assets are preprocessed, but not minified or concatenated.
    * In production mode, served assets are preprocessed, minified and concatenated.
* All assets that live in the same directory as the page's template are automatically included when that page is rendered.
* Use your preferred JavaScript module system (e.g. RequireJS, AMD, CommonJS, Marionette Modules, etc.).
* Easily run your favorite preprocessing and minification tasks (scss, coffee, uglify, etc.).
* Easily include [Bower](http://bower.io/) components as bundles.

## Overview

### The asset library

You keep all your assets, regardless of type, in your application's **_asset library_** (except for assets that are just used by a particular page, which can be stored with that page's template - see below). Each subdirectory of your asset library defines a **_bundle_** that may contain javascript files, stylesheets, and templates. Additionally, each bundle may contain a `bundle.json` file, which contains meta-data about that bundle, such as any dependencies on other bundles. For example, take the following directory structure. (The contents of `bundle.json` are inlined.)

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

The `EditPersonDialog` bundle directly depends on the `Dialogs` bundle, and indirectly depends on the other three bundles. When you require a bundle, dependencies are automatically resolved.

It is also possible to implicitly declare dependencies by nesting bundles - by default, child bundles automatically depend on their parent bundles. For example, we can put the `EditPersonDialog` bundle inside the `Dialogs` bundle, like so:

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

Now the bundle named `Dialogs/EditPersonDialog` depends on on the `Dialogs` bundle (and indirectly depends on the other three bundles), just by virtue of the directory structure.

### Page specific assets

In addition to the assets in bundles that are required by a page, the assets that live in the same directory as a page's template will automatically be included when it is rendered. For example, say your page templates live in a directory named `views`, as is typical for most web frameworks.

```
views/
    login/
        login.jade
        login.coffee
        login.scss
    admin/
        peopleList/
            peopleList.jade
            peopleList.coffee
            peopleList.scss
```

When the `login.jade` template is rendered, the `login.coffee` and `login.scss` assets will automatically be injected into the HTML of the page, as will the `peopleList.*` assets when the `peopleList.jade` template is rendered.

## How it works

### The Cartero Grunt Task

The heart of Cartero is an intelligent [Grunt.js](http://gruntjs.com/) task that glues together other Grunt.js tasks, combining some brains with Grunt's brawn. You configure and call the **_Cartero Grunt Task_** from your application's gruntfile. You specify exactly which preprocessing and minification tasks your application needs, and those tasks are then called by the Cartero task at the appropriate times. After the Cartero task is finished, all of your assets will be preprocessed, and, in production mode, concatenated and minified. Additionally, the Cartero task generates a `cartero.json` file that maps each of your page view templates to a list of all the assets that it requires.

### The Hook

There is also a small but important piece of logic for serving up assets and injecting them into rendered HTML, called a **_Hook_**. The Hook needs to reside in your web application framework, since it is used at the time your templates are rendered. Currently there is a Hook available only for Node.js / Express, but there is minimal logic involved and it is easy to implement in any environment. Each time you render a template, the Hook is used to look up the template in the `cartero.json` file generated by the Cartero Grunt Task, and place raw HTML into three variables that are exposed to the template:

`cartero_js` - the raw HTML of the `<script>` elements that load all the required javascript files.

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
                assetLibary : {
                    path : "assetLibrary/"
                },
                views : {
                    path : "views/"
                }
                publicDir : "static/"
            }

            dev : {
                options : {
                    mode : "dev"
                }
            }

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

The four required options for the Cartero Grunt Task are `projectDir`, `assetLibary`, `views`, and `publicDir`. The `projectDir` option specifices the root folder for your project. *All paths used by Cartero, including all other paths in the gruntfile, are considered to be relative to this directory.* The `assetLibary` option specifies where your asset library is located, and the `views` option specifies where your page views are located, that is, the directory that contains your page templates. The `publicDir` option tells Cartero where your application's "public" folder is located, or the "static" folder in Node.js / Express apps. Cartero will automatically create two directories within `publicDir` into which processed assets will be dumped - `bundle-assets` and `view-assets`. Those directories will contain assets specific to bundles and page views, respectively.

The Cartero Grunt Task also takes options that allow you to call any preprocessing and minification tasks you need to be performed on your assets (e.g. compiling .scss, uglifying javascript, etc.). See below for a complete list of options for the Cartero task.

Once you have configured the Cartero Grunt Task, you need to configure the Hook in your web framework. As of this writing there is only a Hook available for Node.js / Express, which is implemented as Express middleware. You just need to install the middleware, passing it a single argument, which is your project directory, that is, the `projectDir` option from the gruntfile configuration.

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
    app.use( carteroHook( __dirname ) );
} );
```

Now you are ready to go. To let Cartero know which asset bundles are required by which pages, you use **_Directives_**. The Cartero Grunt Task scans your page template files for these Directives, which have the form `##cartero_xyz`. The "requires" Directive is used to declare dependencies:

```jade
// peopleList.jade

// ##cartero_requires "jQuery", "dialogs/editPersonDialog"

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

Now run the following command from the directory of your gruntfile:

    grunt cartero

The Cartero Grunt Task will fire up, preprocess all of your assets, and put the `cartero.json` file used by the Hook in your project folder. In `dev` mode, the Cartero Grunt Task will automatically watch all of your assets for changes and recompile them as needed. In `prod` mode, the task will terminate after minifying and concatenating your assets. In either case, when you load a page, the three variables `cartero_js`, `cartero_css`, and `cartero_tmpl` with be available to the page's template, and will contain all the raw HTML necessary to load the assets for the page.