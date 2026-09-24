// Text resizing functions

function resizeAndPositionToFit(elementName, text, defaultFontSize, defaultPosition, positionScale, positionType)
{
    defaultPosition = typeof defaultPosition !== 'undefined' ? defaultPosition : 0;
    positionScale = typeof positionScale !== 'undefined' ? positionScale : 0.5;
    positionType = typeof positionType !== 'undefined' ? positionType : 'top';

    newFontSize = textSizeToFit(elementName, text, defaultFontSize);
    newPosition = defaultPosition + positionScale * (defaultFontSize - newFontSize);

    newProps = {}
    newProps['font-size'] = newFontSize + 'px';
    newProps[positionType] = newPosition + 'px';

    $('#' + elementName).css(newProps);
}

function resizeAndPositionToMatch(element1Name, text1, element2Name, text2, defaultFontSize, defaultPosition, positionScale, positionType)
{
    defaultPosition = typeof defaultPosition !== 'undefined' ? defaultPosition : 0;
    positionScale = typeof positionScale !== 'undefined' ? positionScale : 0.5;
    positionType = typeof positionType !== 'undefined' ? positionType : 'top';

    fontSize1 = textSizeToFit(element1Name, text1, defaultFontSize);
    fontSize2 = textSizeToFit(element2Name, text2, defaultFontSize);

    if (fontSize1 != defaultFontSize || fontSize2 != defaultFontSize)
    {
        newFontSize = Math.min(fontSize1, fontSize2);
    }
    else
    {
        newFontSize = defaultFontSize;
    }

    newPosition = defaultPosition + positionScale * (defaultFontSize - newFontSize);

    newProps = {}
    newProps['font-size'] = newFontSize + 'px';
    newProps[positionType] = newPosition + 'px';
    
    $('#' + element1Name).css(newProps);
    $('#' + element2Name).css(newProps);
}

function textSizeToFit(elementName, text, defaultFontSize, futureWidth, fitParent)
{
    fitParent = typeof fitParent !== 'undefined' ? fitParent : false;
    futureWidth = typeof futureWidth !== 'undefined' ? futureWidth : -1;

    fontFamily = $('#' + elementName).css('font-family').split(',')[0];
    font = defaultFontSize + 'px ' + fontFamily;

    testWidth = getTextWidth(text, font);
    if (futureWidth == -1)
    {
        $element = $('#' + elementName);
        if (fitParent)
        {
            $element = $element.parent();
        }

        elementWidth = $element.width();
    }
    else
    {
        // future width was specified, use it
        // this is the anticipated width at the end of an animation
        elementWidth = futureWidth;
    }

    if (testWidth > elementWidth)
    {
        //scale to fill
        fontSize = defaultFontSize * elementWidth / testWidth;
    }
    else
    {
        fontSize = defaultFontSize;
    }

    fontSize = Math.floor(fontSize);

    // console.log('elementName: ' + elementName + ', text: ' + text + ', fitParent: ' + fitParent + ', futureWidth: ' + futureWidth + ', testWidth: ' + testWidth + ', elementWidth: ' + elementWidth + ', fontSize: ' + fontSize);

    return fontSize;
}

function getTextWidth(text, font)
{
    // re-use canvas object for better performance
    var canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    var context = canvas.getContext("2d");
    context.font = font;
    var metrics = context.measureText(text);
    return metrics.width;
}

// Image URL functions

function setImageUrl(path)
{
    url = path;

    // for windows
    if (path != null && path.search(/^[A-Z]:\\/) == 0)
    {
        url = filePathToUrl(path)
    }

    return url;
}

String.prototype.replaceAll = function (find, replace)
{
    var str = this;
    return str.replace(new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replace);
};

function filePathToUrl(path)
{
	if (path == null)
	{
		return null;
	}
	
    path = path.replaceAll('\\', '/');
    path = path.replaceAll(' ', '%20');
    var drive = /(.)\:\//
    return path.replace(drive, 'file:///$1:/');
}

// Image scaling functions

function scaleAndApplyImage(url, width, height, scaleType, elementId, show)
{
    if (typeof bridge !== 'undefined' &&
        typeof bridge.scaleImage !== 'undefined')
    {
        bridge.scaleImage(url, width, height, scaleType, elementId, show, 'applyImage');
    }
    else
    {
        applyImage(url, elementId, show);
    }
}

function applyImage(url, elementId, show)
{
    console.log('applyImage: url: ' + url + ', elementId: ' + elementId + ', show: ' + show);

    $element = $('#' + elementId)
    $element.css('background-image', 'url(' + url + ')');
    if (show)
    {
        $element.show();
    }
}

