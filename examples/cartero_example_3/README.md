This example demonstrates how you might organize your bundles if you are using Bower.

As usual, the Bower-managed libraries are located in the `components` directory.  In order to avoid creating `bundle.json` files inside `components`, the `bowerBundleProperties.json` is used to specify metadata.

Take a look at [page1.html.swig](https://github.com/rotundasoftware/cartero/blob/master/examples/cartero_example_3/views/page1/page1.html.swig) to see how you can reference Bower-maintained libraries through namespacing
