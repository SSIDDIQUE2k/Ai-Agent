var minWinVersion = '3.2.10'.split('.');
var minMacVersion = '3.6.10'.split('.');

var formData = {};

$(document).ready(
	function()
	{
		var includeFilesJS = [
			'JS/colorpicker.js',
			'JS/spectrum.js',
			'JS/pipFormUtilities.js'
		];

		var includeFilesCSS = [
			'CSS/spectrum.css'
		];

		initializeDependencies(includeFilesJS, includeFilesCSS);

		$(window).keydown(
			function(event)
			{
				if(event.keyCode == 13)
				{
					event.preventDefault();
					return false;
				}
			}
		);

		initializeForm();
		initializeFormData();
		loadFormData();
		addEventHandlers();
	}
);

function didProcessForm()
{
	if (typeof bridge !== 'undefined')
	{
		if (typeof bridge.pipConfigure === 'undefined')
		{
			//hide pip controls
			$('#pip-container').hide();
		}
		else
		{
			//configure PIP controls
			bindPipConfiguration("#pipSourceSelect", "#pipConfigureButton");
		}
	}
}

function sendLocalData(data)
{	
	if (typeof bridge !== 'undefined')
	{
		bridge.sendLocalData(JSON.stringify(data));
	}
}

function sendGlobalData(data)
{
	if (typeof bridge.sendGlobalData !== 'undefined')
	{
		bridge.sendGlobalData(JSON.stringify(data));
	}
}

function formUpdated()
{
	// used to dump all data to overlay on initialization
	sendLocalData(formData);
}

function saveOverlay()
{
	//use bridge method to save that data
	if (typeof bridge != 'undefined') {
		//save the data
		bridge.writeFile(JSON.stringify(formData), "overlayData.json");
	}
}

function initializeFormData()
{
	//set defaults to UI values
	$('input[type=checkbox]').each(
		function()
		{
			formData[$(this).attr('id')] = $(this).prop('checked');
		}
	);

	formData['popup-text'] = $('#popup-text').val();

	formData['theme-select'] = $('#theme-select').val();

	formData['bookend-select'] = $('#bookend-select').val();
	updateBookendSelect();

	formData['team-name-select'] = $('#team-name-select').val();

	formData['left-color-logo-select'] = $('#left-color-logo-select').val();
	updateLeftColorLogoSelect();

	formData['left-custom-color'] = $('#left-custom-color').val();

	formData['right-color-logo-select'] = $('#right-color-logo-select').val();
	updateRightColorLogoSelect();

	formData['highlight-color-select'] = $('#highlight-color-select').val();
	updateHighlightColorContainer();

}

function addEventHandlers()
{
	// check box updates
	$('input[type=checkbox]').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).prop('checked')
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}
		}
	);

	$('#popup-text').on('input',
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}
		}
	);

	// handle theme events
	$('#theme-select').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {}
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}
		}
	);

	// handle school bookend events
	$('#bookend-select').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}

			updateBookendSelect();
		}
	);

	// handle team name events
	$('#team-name-select').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {}
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}
		}
	);

	// handle color/logo events
	$('#left-color-logo-select').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}

			updateLeftColorLogoSelect();
		}
	);

	// handle color picker events
	$('#left-custom-color').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}
		}
	);

	// handle color/logo events
	$('#right-color-logo-select').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}

			updateRightColorLogoSelect();
		}
	);

	// handle color picker events
	$('#right-custom-color').change(
		function()
		{
			key = $(this).attr('id');
			newValue = $(this).val();
			if (formData[key] != newValue)
			{
				formData[key] = newValue;

				localData = {};
				localData[key] = newValue;

				sendLocalData(localData);
				saveOverlay();
			}
		}
	);

	$('#highlight-color-select').change(function()
	{
		highlightColorSelect = $('#highlight-color-select').val()
		if (formData['highlight-color-select'] != highlightColorSelect)
		{
			formData['highlight-color-select'] = highlightColorSelect;
			updateHighlightColorContainer();

			localData = {
				'highlight-color-select' : highlightColorSelect
			};
			sendLocalData(localData);

			console.log(highlightColorSelect);
			saveOverlay();
		}
	});

	$('#custom-highlight-color').change(function()
	{
		customHighlighColor = $('#custom-highlight-color').val();
		if (formData['custom-highlight-color'] != customHighlighColor)
		{
			formData['custom-highlight-color'] = customHighlighColor;

			localData = {
				'custom-highlight-color' : customHighlighColor
			}
			sendLocalData(localData);

			saveOverlay();
		}
	});

}

function loadFormData()
{
	//load the saved data
	if (typeof bridge !== undefined)
	{
		//call readFile, completion handler set
		bridge.readFile("overlayData.json", "loadDataCompletion")
	}
}

function loadDataCompletion(data)
{

	if (typeof data == 'object')
	{
		overlayData = data;
	}
	else if (typeof data == 'string')
	{
		overlayData = JSON.parse(data); //set the data equal to what was in the saved location
	}
	else
	{
		console.log('Failed to load form data from file.')
		return;
	}

	$.each(overlayData,
		function (key, value)
		{
			formData[key] = value;

			element = $('#' + key);
			if (element.attr('type') == 'checkbox')
			{
				element.prop('checked', value);
			}
			else if (element.attr('id') == 'popup-text' ||
				element.attr('id') == 'team-name-select' ||
				element.attr('id') == 'theme-select')
			{
				element.val(value);
			}
			else if (element.attr('id') == 'left-custom-color')
			{
				element.spectrum({ color: value });
			}
			else if (element.attr('id') == 'left-color-logo-select')
			{
				element.val(value);
				updateLeftColorLogoSelect();
			}
			else if (key == 'left-custom-logo')
			{
				updateImagePreview(key);
			}
			else if (element.attr('id') == 'bookend-select')
			{
				element.val(value);
				updateBookendSelect();
			}
			else if (key == 'bookend-logo')
			{
				updateImagePreview(key);
			}
			else if (element.attr('id') == 'right-custom-color')
			{
				element.spectrum({ color: value });
			}
			else if (element.attr('id') == 'right-color-logo-select')
			{
				element.val(value);
				updateRightColorLogoSelect();
			}
			else if (key == 'highlight-color-select')
			{
				$('#highlight-color-select').val(value);
				updateHighlightColorContainer();
			}
			else if (key == 'custom-highlight-color')
			{
				$('#custom-highlight-color').spectrum('set', value);
			}
			else if (key == 'right-custom-logo')
			{
				updateImagePreview(key);
			}else
			{
				element.val(value).change();
			}
		}
	);

	sendLocalData(formData);
}

function fileSelectorOverrideComplete(elementId, fileName)
{
	if (typeof formData[elementId] == 'undefined' || formData[elementId] != fileName)
	{
		formData[elementId] = fileName;
		updateImagePreview(elementId);

		localData = {};
		localData[elementId] = fileName;
		sendLocalData(localData);

		saveOverlay();
	}
}

function clearFileInput(elementId)
{
	if (typeof formData[elementId] == 'undefined' || formData[elementId] != null)
	{
		formData[elementId] = null;

		updateImagePreview(elementId);

		localData = {};
		localData[elementId] = null;
		sendLocalData(localData);

		saveOverlay();
	}
}

function updateImagePreview(elementId)
{
	if (formData[elementId] == null || formData[elementId] == '')
	{
		$('#' + elementId + '-preview').css({ 'background': '' });
	}
	else
	{
		$('#' + elementId + '-preview').css({ 'background': 'url(' + formData[elementId] + ')' });
	}
}

function updateLeftColorLogoSelect()
{
	if ($('#left-color-logo-select').val() === 'custom')
	{
		$('#left-custom-color-logo-container').show();
	}
	else
	{
		$('#left-custom-color-logo-container').hide();
	}
}

function updateBookendSelect()
{
	if ($('#bookend-select').val() === 'custom')
	{
		$('#bookend-custom-container').show();
	}
	else
	{
		$('#bookend-custom-container').hide();
	}
}

function updateRightColorLogoSelect()
{
	if ($('#right-color-logo-select').val() === 'custom')
	{
		$('#right-custom-color-logo-container').show();
	}
	else
	{
		$('#right-custom-color-logo-container').hide();
	}
}

function updateHighlightColorContainer()
{
	if (formData['highlight-color-select'] != 'custom')
	{
		$('#custom-highlight-color-container').hide();
	}
	else
	{
		$('#custom-highlight-color-container').show();
	}
}