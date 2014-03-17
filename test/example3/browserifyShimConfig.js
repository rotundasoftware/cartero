module.exports = {
	"./node_modules/jquery/dist/jquery.js" : "$",
	"./node_modules/jqueryui-browser/ui/jquery-ui.js" : { "depends": { "./node_modules/jquery/dist/jquery.js" : "$" } }
};