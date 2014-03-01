

An asset pipeline built on [browserify](http://browserify.org/). 

## Benefits

* Use commonjs requires to get your javascript, css, and other assets where you need them to be, in the form you need them to be in.
* Include css, image, and template assets in npm modules and then serve them directly to your rendered pages.
* Sane directory structure - keep assets used by a particular view template in the same folder as the view.
* Easily serve only the assets that are required by each page in multi-page applications.

Example:

```
views
└── page1
    ├── package.json
    ├── page1.css
    ├── page1.jade
    └── page1.js
```

In package.json, we have

```
{
	"view" : "page1.jade",
	"main" : "page1.js",
	"style" : "page1.css"
}
```

## package.json

```
{
	"style" : "*.css",
	"image" : "*.png",
	"template" : "*.tmpl",

	"cartero-transforms" : {
		"style" : [ "sass-css-stream" ],
		"image" : [ "png-compressor" ],
		"template" : [ "nunjucks-transform" ]
	}
}
```

## carteroConfig.json

```
{
	// needed to override / amend package.json in 3rd party libraries that don't behave well.
	"package-extends" : {
		"jqueryui-browser" : {
			"main" : "ui/jquery-ui.js",
			"style" : "themes/base/jquery-ui.css"
		}
	},

	"package-defaults" : { // this could alternatively be parcel-defaults, and then only apply to parcels
		"style" : "*.scss",

		"cartero-transforms" : {
			"style" : [ { "sass-css-stream" : { includePaths : [ "/my/abs/include/path" ] } ], // transform options are specified using an object.
			"script" : [ { "browserify-shim" : "/abs/path/to/browserifyShimConfig.js" } ] // script global transforms are passed through to browserify. note this needs to be absolute path
		}
	},

	"post-process" : {
		"script" : [ "uglify-stream" ],
		"style" : [ "minify-css-stream" ]
	}
}
```

## Contributers

* [James Halliday](https://twitter.com/substack)
* [Oleg Seletsky](https://github.com/go-oleg)
* [David Beck](https://twitter.com/davegbeck)

## License

MIT

would be cool to let people apply transforms to their own packages. but this is not realistic, because.
	1. there is no agreed upon tranform format


cartero is more global 


because there is no tranform consensus, need to namespace transforms under cartero.

OR, we just 

apply these transforms to all MY modules.
