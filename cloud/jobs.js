/* global Parse */
/* ERROR CODES: https://parse.com/docs/js/guide#errors */

/*
    Get missing info from Facebook. This will also trigger the before_save for each user.
*/
Parse.Cloud.job("fixUsers", function (request, status) {
    // Set up to modify user data
    Parse.Cloud.useMasterKey();
    // Query for all users
    var query = new Parse.Query(Parse.User);
    query.each(function(user) {
        // Get missing info from Facebook
        var auth = user.get("authData");
        var facebookAuth = auth ? auth.facebook : null;
        if (facebookAuth && facebookAuth.access_token) {
            var url = "https://graph.facebook.com/me?access_token=" + facebookAuth.access_token;
            Parse.Cloud.httpRequest({
                url: url,
                success: function(httpResponse) {
                    var facebookUser = JSON.parse(httpResponse.text);
                    if (!user.get("name")) {
                        user.set("name", facebookUser.first_name);
                    }
                    if (!user.get("gender")) {
                        user.set("gender", facebookUser.gender);
                    }
                    user.save();
                    if (!user.get("email")) {
                        user.set("email", facebookUser.email);
                    }
                    return user.save();
                },
                error: function(httpResponse) {
                    console.error('Facebook request error: ' + httpResponse.status + " " + JSON.parse(httpResponse.text).error.message);
                    return user.save();
                }
            });
        } else {
            return user.save();
        }
    }).then(function() {
        // Set the job's success status
        status.success("Migration completed successfully.");
    }, function(error) {
        // Set the job's error status
        status.error("Uh oh, something went wrong: " + error.code);
    });
});

/*
    Get missing name from Facebook, for when user's access token has expired. This will also trigger the before_save for each user.
*/
Parse.Cloud.job("fixUsersName", function (request, status) {
    // Set up to modify user data
    Parse.Cloud.useMasterKey();
    // Query for all users
    var query = new Parse.Query(Parse.User);
    query.each(function(user) {
        // Get missing info from Facebook
        var facebookId = user.get("facebookId");
        if (facebookId) {
            var url = "https://graph.facebook.com/" + facebookId + "?access_token=CAAXaOcS7a6cBACGWf1AcA3t6AKcY1xMjXPEnqLYGjMrlCcMG6fRkuTZBz9Kzg7ZAUdZBoDzePmWcERbSMz4A4aAyTZB2KEtWvIJazQWOZAhl9PdFCzr4BMX7FSDcgFSlnwV1BK8ymivQnXvcfu94yHE5aQLvSkJ4dnwvxYX83xWjLpLy7cruPwZBO4l2ZAPZCNIOHLCFt718r41YxytIZC8Sh";
            Parse.Cloud.httpRequest({
                url: url,
                success: function(httpResponse) {
                    var facebookUser = JSON.parse(httpResponse.text);
                    if (!user.get("name")) {
                        user.set("name", facebookUser.first_name);
                    }
                    return user.save();
                },
                error: function(httpResponse) {
                    console.error('Facebook request error: ' + httpResponse.status + " " + JSON.parse(httpResponse.text).error.message);
                    return user.save();
                }
            });
        } else {
            return user.save();
        }
    }).then(function() {
        // Set the job's success status
        status.success("Migration completed successfully.");
    }, function(error) {
        // Set the job's error status
        status.error("Uh oh, something went wrong: " + error.code);
    });
});

/*
    Fix photos ACL.
*/
Parse.Cloud.job("fixPhotos", function (request, status) {
    // Set up to modify photos data
    Parse.Cloud.useMasterKey();
    // Query for all photos
    var query = new Parse.Query("Photo");
    query.each(function(photo) {
        var acl = new Parse.ACL();
        acl.setReadAccess(photo.get("userId"), true);
        acl.setWriteAccess(photo.get("userId"), true);
        acl.setPublicReadAccess(true);
        photo.setACL(acl);
        return photo.save();
    }).then(function() {
        // Set the job's success status
        status.success("Migration completed successfully.");
    }, function(error) {
        // Set the job's error status
        status.error("Uh oh, something went wrong: " + error.code);
    });
});