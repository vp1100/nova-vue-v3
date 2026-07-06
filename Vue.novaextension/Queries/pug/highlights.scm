(comment) @comment

(doctype) @processing.doctype

(tag_name) @tag.name
(class) @style.selector.identifier.class
(id) @style.selector.identifier.id

(attribute_name) @tag.attribute.name
(attribute
  "=" @tag.attribute.operator)

(quoted_attribute_value
  [
    "\""
    "'"
  ] @tag.attribute.value.delimiter)
(attribute_value) @tag.attribute.value

(keyword) @keyword

(mixin_name) @identifier.function
(filter_name) @identifier.function
(filename) @string
(content) @string

[
  "."
  "#"
  ":"
  "="
  "!="
  "+"
  "-"
  "|"
] @operator

[
  "("
  ")"
  "["
  "]"
  "#{"
  "#["
] @bracket
