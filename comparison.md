# Cartero compared to other solutions

[cartero](https://github.com/rotundasoftware/cartero) is a streaming asset pipeline based on npm packages. Think [browserify](http://browserify.org/) + [gulp](http://gulpjs.com/) + [the rails asset pipeline](http://guides.rubyonrails.org/asset_pipeline.html). It picks up where npm and browserify leave off, handling the build process, including precompiling, postprocessing, and serving HTML, js, css, and images. Of the existing tools out there for modular front end development, it is most similar to [Component](https://github.com/component/component). To add to [this great article](https://github.com/component/guide/blob/master/component/vs.md) that compares Component to other front end solutions, here is a comparison between cartero and Component. 

### cartero vs Component

#### cartero is built on npm and browserify.

A cartero component ***is*** an npm module. To require an npm module, you just do `require( 'mushu' )`. Component conforms to the CommonJS spec, but it provides its own package management system with its own API. As a result, you can not require npm modules from your components, and a special `component.json` file is needed to define a component. cartero relies on npm's `package.json`.

Another benefit of being built on npm is that npm handles the case where two different packages require two different versions of a dependency very nicely. In general, the consensus is that npm is a pretty awesome package manager, and it provides a solid foundation.

#### cartero is a streaming asset pipeline.

Do you use Sass or CoffeeScript? Maybe you want to inline images in your css files? cartero transforms make it easy to manipulate your assets any way you want. Similar to browserify and gulp, cartero is built on streams, so all you need in a simple transform module to get you where you want to be. You can even use browserify transforms like [hbsfy](https://github.com/epeli/node-hbsfy) and [nunjucksify](https://github.com/rotundasoftware/nunjucksify) to precompile your template files.

#### cartero is designed for multi-page applications

`cartero <parcelsDir> <destDir>` is all you need to build all your assets for your entire application. Packages (a.k.a "components") that are shared by all pages of your app can reside in a `node_modules` folder at the root of your app. The bundles that are generated for each page will only include the assets that are needed by that page, as determined by what is `require`'d by the page's JavaScript.

#### cartero generates `<script>` and `<link>` tags

Similar to the [rails asset pipeline](http://guides.rubyonrails.org/asset_pipeline.html), the [cartero hook](https://github.com/rotundasoftware/cartero-node-hook) generates your `script` and `link` tags for you. There are several advantages to this approach.

  * You don't ever have futz with these damn tags! Just `require()` what you need from a given page, and the appropriate tags will automatically be generated for you.
  * cartero can keep css files separate for you in dev mode, and just generate a different set of `link` tags to load your seperate css assets.
  * cartero can implement cache busting through [fingerprinting](http://guides.rubyonrails.org/asset_pipeline.html#what-is-fingerprinting-and-why-should-i-care-questionmark), so that when your assets change browsers will reload your asset bundles.

#### cartero's watch mode is very efficient

cartero's watch mode only updates the files that it absolutely needs to given the changes made to a source file. Thus it can watch an entire application at once without slowing down.

#### The cartero hook can tell you the url of any given asset

The cartero hook can be used at run time to track down the url of path of an asset given its source path, even if that path is in some very deeply nested dependency.

#### cartero is young

Component is not so young. It's a double edged sword. cartero surely has more bugs and fringe cases that have not been considered. The flip side is that there is lots of room for improvement and changes. Send us your feedback and help cartero grow up!
