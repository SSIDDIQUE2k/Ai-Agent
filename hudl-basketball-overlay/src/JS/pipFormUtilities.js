var pipSelectId = null;
var pipButtonId = null;

function bindPipConfiguration(selectId, buttonId) {
	//utility method for setting up bridge events with select and button element

	pipSelectId = selectId;
	pipButtonId = buttonId;

	//When the PIP source selection is changed:
	//	1) Disable the PIP configuration button if a valid source is not selected
	//	2) Notify the native code that a PIP source has been selected
	$(pipSelectId).change(
		function()
		{
			noneSelected = $(pipSelectId).val() == 'none';

			//disable pip configure button if a valid pip source is not selected
			$(pipButtonId).prop("disabled", noneSelected);

			if (typeof bridge != 'undefined')
			{
				bridge.pipSourceSelected($(pipSelectId).val());
			}
		}
	);

	//When the PIP configuration button is pressed
	//	Notify the native code to show configuration window
	$(pipButtonId).click(
		function()
		{
			if (typeof bridge != 'undefined')
			{
				bridge.pipConfigure();
			}

		}
	);
}

function updatePipSources(pipSources) {
	//called by bridge when pip sources change

	//hold on to current selection to reset at the end
	oldSelection = $(pipSelectId).val();

	//once a valid pip source has been selected do not populate 'none' option
	selectHtml = "<option value='none'>none</option>";
	$.each(pipSources,
		function(i, val)
		{
			selectHtml += "<option value='" + val + "'>" + val + "</option>";
		}
	);

	//set options
	$(pipSelectId).html(selectHtml);
	$(pipSelectId).val(oldSelection);
}