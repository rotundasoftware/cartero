(function() {
  $(document).ready(function() {
    var buttonClickedFunc;
    buttonClickedFunc = function() {
      return alert("Button clicked!");
    };
    return $("#coffeeDemoButton").click(buttonClickedFunc);
  });

}).call(this);
