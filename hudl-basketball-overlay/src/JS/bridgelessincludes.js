var initializeDependencies = function(JSIncludesList, CSSIncludesList)
{
    var __init__ = function()
    {
        $.each(JSIncludesList,
            function(intIndex, objValue)
            {
    			$.ajax({
    				url: objValue,
    				dataType: 'script',
    				async: false
    			});
            }
        );

        $.each(CSSIncludesList,
            function(intIndex, objValue)
            {
                $('head').append('<link rel="stylesheet" href="' + objValue + '" type="text/css" />');
            }
        );
    };

    if (typeof willInitializeDependencies != 'undefined')
    {
        willInitializeDependencies();
    }

    __init__();

    if (typeof didInitializeDependencies != 'undefined')
    {
        didInitializeDependencies();
    }
};

var initializeForm = function()
{
    // Validate Truck Version

    if (typeof bridge.getPTVersion != 'undefined')
    {
        bridge.getPTVersion('validatePTVersion');
    }
    else
    {
        console.log("couldn't find a truck version function");
        validatePTVersion("{}");
    }
};

var processForm = function()
{
    if (typeof preprocessColorPicker != 'undefined')
    {
        preprocessColorPicker();
    }
};

function validatePTVersion(versionStr)
{
    var version = JSON.parse(versionStr);

    validVersion = false;
    if (typeof version['platform'] != 'undefined' && typeof version['version'] != 'undefined')
    {
        versionArray = $.map(version['version'].split("."),
            function(val, i)
            {
                return parseInt(val);
            }
        );
        platform = version['platform'];

        if (platform == 'mac')
        {   
            minVersion = minMacVersion;
        }
        else if (platform == 'windows')
        {
            minVersion = minWinVersion;
        }

        minVersion = $.map(minVersion,
            function(val, i)
            {
                return parseInt(val);
            }
        );

        if (versionArray[0] > minVersion[0] ||
            versionArray[0] == minVersion[0] && versionArray[1] > minVersion[1] ||
            versionArray[0] == minVersion[0] && versionArray[1] == minVersion[1] && versionArray[2] >= minVersion[2])
        {
            validVersion = true;
        }
    }

	if (!validVersion)
    {
		$('body').empty();
		$('body').html('<span style="font-family: Arial; font-size:18px; font-style:normal; font-weight:normal; text-decoration:none; text-transform:none; color: #CC0000;">' +
			'This overlay is not supported on this version of Production Truck. Please ensure you are running the latest version.</span>');
	}
    else
    {
        // Process Form

        if (typeof willProcessForm != 'undefined')
        {
            willProcessForm();
        }

        processForm();

        if (typeof didProcessForm != 'undefined')
        {
            didProcessForm();
        }

        // Document ready

        if (typeof bridge.documentReady != 'undefined')
        {
            bridge.documentReady();
        }
    }
}

function triggerEvent(eventName, userdata)
{    
    $.event.trigger({
        type: eventName,
        userdata: userdata,
        time: new Date()
    });
}