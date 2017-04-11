$(document).ready(function(){
  $("#loginform").validate({
   rules: {     
    username: {email:true,required: true},
    password: {required: true},
    cpassword: {required: true}
   },
   
   tooltip_options: {
       username: {trigger:'focus'},
    password: {placement:'right',html:true},
    cpassword: {placement:'right',html:true}
   },
   submitHandler: function(form) { 
    alert("No Error.Like a Boss");
   }
   
  });
 });