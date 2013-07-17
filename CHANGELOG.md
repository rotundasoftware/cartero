# Change log

### v0.1.2
* Make the browserify feature work without relying on the library dir being a node_modules folder
* Allow ##cartero_requires directive value to span multiple lines
* Bug Fixes:
	* Check for ##cartero_browserify_executeOnLoad in original file in case it was removed due to a processing step.
	* Improve logging/reporting when a non-existant bundle is listed as a dependency.
	* Fix order in which ##cartero_extends files are sourced.

### v0.1.1

* Grab dependencies from bower.json file if it exists in a Bundle.  Makes integration with Bower easier.
* Add sourceFilePaths to files in filesToServe to keep track of which files were concatenated.
* Bug Fixes:
  * Run replaceCarteroDirTokens task before buildParcelRegistry so ##cartero_dir tokens are replaced with file's location before concatenation.

### v0.1.0

* Initial release
