<!doctype html>

<html>
<head>

{% block head %}
{{ cartero_js|raw }}
{{ cartero_css|raw }}
{% endblock %}


</head>

<body>
{% block content %}{% endblock %}

{{ cartero_tmpl|raw }}
</body>


</html>
