/* global Parse */
/* ERROR CODES: https://parse.com/docs/js/guide#errors */

/*
    Used to return the location of devices with the app installed. Installation object needs the location field.
    Returns:
    - Array of Installation (with only the location field)
*/
Parse.Cloud.define("deviceLocations", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.user.get("admin")) {
        response.error("User making the request is not an administrator");
    }

    var query = new Parse.Query(Parse.Installation).select("location").exists("location").limit(1000);
    query.find({
        useMasterKey: true,
        success: function (results) {
            response.success(results);
        },
        error: function (error) {
            response.error(error);
        }
    });
});
