<!doctype html>

<html>
<head>

{% block head %}
{{ bundler_js|raw }}
{{ bundler_css|raw }}
{% endblock %}


</head>

<body>
{% block content %}{% endblock %}

{{ bundler_tmpl|raw }}
</body>


</html>