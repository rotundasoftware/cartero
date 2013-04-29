<!doctype html>

<html>
<head>

{% block head %}
{{ js_files|raw }}
{{ css_files|raw }}
{% endblock %}


</head>

<body>
{% block content %}{% endblock %}

{{ tmpl_contents|raw }}
</body>


</html>