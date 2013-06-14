{% extends 'layout.html.swig' %}

<!-- ##cartero_requires "Main/JQuery", "Main/Backbone/Person" -->

<!-- ##cartero_extends "layout.html.swig" -->


{% block content %}

<h1>It Works!</h1>

<h2>Congrats!  You are ready to rock with Cartero!</h2>

Below is the output from a very very simple app built using Cartero.
This page declares just two dependencies:
<ul>
	<li>JQuery</li>
	<li>Person</li>
</ul>
The Person bundle contains:
<ul>
	<li>personModel.js</li>
	<li>personView.js</li>
	<li>personView.tmpl</li>
	<li>personView.scss</li>
</ul>
Those files and Backbone (Person's dependency) are automatically loaded and you get a rendered Person!
<hr/>
<div id="personContainer"></div>

{% endblock %}