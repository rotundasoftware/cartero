# Change log

### v0.2.0
* Add `allowNestedBundles` property in `library` directory configuration and default to `true`.
* Remove default value for `filesToIgnore` in `views` directory configuration.
* Make the browserify feature work without relying on the library directory being a node_modules folder.
* Allow ##cartero_requires directive value to span multiple lines.
* Support browserifying `.coffee` files.
* Bug Fixes:
	* Check for ##cartero_browserify_executeOnLoad in original file in case it was removed due to a processing step.
	* Fix order in which ##cartero_extends files are sourced.

### v0.1.1

* Grab dependencies from bower.json file if it exists in a Bundle.  Makes integration with Bower easier.
* Add sourceFilePaths to files in filesToServe to keep track of which files were concatenated.
* Bug Fixes:
  * Run replaceCarteroDirTokens task before buildParcelRegistry so ##cartero_dir tokens are replaced with file's location before concatenation.

### v0.1.0

* Initial release
