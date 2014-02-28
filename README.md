

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
	"image" : "*.png,*.jpg",
	"template" : "*.tmpl"
	"transform" : {
		"style" : "sass-transform",
		"image" : "png-compressor-transform",
		"template" : "nunjucks-transform"
	}
}
```

## carteroConfig.json

```
{
	"package-extends" : {
		"jqueryui-browser" : {
			"style" : "themes/base/jquery-ui.css"
		}
	},

	"package-defaults" : {
		"style" : "*.scss,*.css",
		"template" : "*.tmpl",
		"image" : "*.png,*.jpg",
		"browserify" : {
			"transform" : [ "browserify-shim" ]
		},
		"browserify-shim" : "/Users/david_beck/Documents/git/cartero/test/example2/browserifyShimConfig.js",
		"transform" : {
			"style" : [ "cartero-sass" ]
		}
	}
}
```

## Contributers

* [James Halliday](https://twitter.com/substack)
* [Oleg Seletsky](https://github.com/go-oleg)
* [David Beck](https://twitter.com/davegbeck)

## License

MIT

