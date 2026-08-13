// References to the supported choice containers
var radioButtonsContainer = document.getElementById('radio-buttons-container') // default radio buttons
var selectDropDownContainer = document.getElementById('select-dropdown-container') // minimal appearance
var likertContainer = document.getElementById('likert-container') // likert
var input = document.getElementById('filter-text') // search text entry

// Detect right-to-left languages
function isRTL (s) {
  var ltrChars = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' + '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF'
  var rtlChars = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC'
  var rtlDirCheck = new RegExp('^[^' + ltrChars + ']*[' + rtlChars + ']')

  return rtlDirCheck.test(s)
}

// Add filtering of response options (Fuse.js fuzzy search — https://github.com/krisk/Fuse )
var choiceFuse = null
var fuseChoiceRows = []

// Default Fuse.js search tuning — https://fusejs.io/api/options.html
var defaultThreshold = 0.2
var defaultDistance = 64
var defaultMinMatchCharLength = 2
var defaultIgnoreLocation = false

// Default "Other" values
var defaultOtherLabel = 'Other'
var defaultOtherTextRequired = true
var defaultOtherTextPlaceholder = 'Enter other response here'

// Get Fuse.js search tuning from plugin parameters
var threshold = getPluginParameter('threshold')
var distance = getPluginParameter('distance')
var minMatchCharLength = getPluginParameter('minMatchCharLength')
var ignoreLocation = getPluginParameter('ignoreLocation')
var otherParam = getPluginParameter('other')
var otherLabel = getPluginParameter('otherLabel')
var otherTextRequired = getPluginParameter('otherTextRequired')
var otherTextPlaceholder = getPluginParameter('otherTextPlaceholder')

var filterDebounceMs = 120
var filterTimer = null

// "Other" option — logic primarily from https://github.com/surveycto/specify-other
var otherEnabled = otherParam !== undefined && otherParam !== null && String(otherParam).trim() !== ''
var otherValue = otherEnabled ? String(otherParam) : ''
var otherChoiceContainer = null
var otherContainer = null
var otherInput = null
var metadata = ''
var selectedChoices = []
var inputValue = ''
var requireOther = true
var placeholderText
var handlingChange = false

function findOtherChoiceContainer () {
  var inputs = radioButtonsContainer.querySelectorAll('input[name="opt"]')
  for (var i = 0; i < inputs.length; i++) {
    if (String(inputs[i].value) === otherValue) {
      return inputs[i].closest('.choice-container')
    }
  }
  return null
}

function prepareOtherChoice (choiceEl, label) {
  choiceEl.classList.add('other-choice')
  choiceEl.setAttribute('data-other-choice', 'true')
  var labelText = choiceEl.querySelector('.choice-label-text')
  if (labelText && label) {
    labelText.textContent = label
  }
  return choiceEl
}

function setupOtherOption () {
  metadata = getMetaData()
  if (metadata == null) {
    metadata = ''
    selectedChoices = []
    inputValue = ''
  } else {
    var metaParts = metadata.split('|')
    selectedChoices = metaParts[0] ? metaParts[0].split(' ') : []
    inputValue = metaParts[1] || ''
  }

  requireOther = getPluginParameter('otherTextRequired')
  requireOther === 0 ? requireOther = false : requireOther = true

  placeholderText = getPluginParameter('otherTextPlaceholder')

  var otherLabel = getPluginParameter('otherLabel')
  if (otherLabel === undefined || otherLabel === null || otherLabel === '') {
    otherLabel = defaultOtherLabel
  }

  otherChoiceContainer = findOtherChoiceContainer()
  if (!otherChoiceContainer) {
    return
  }
  otherChoiceContainer = prepareOtherChoice(otherChoiceContainer, otherLabel)

  otherContainer = document.createElement('div')
  otherContainer.setAttribute('id', 'other-container')
  otherContainer.style.display = 'none'

  otherInput = document.createElement('textarea')
  otherInput.setAttribute('type', 'text')
  otherInput.setAttribute('id', 'other-input')

  if (placeholderText !== undefined) {
    if (placeholderText === '') {
      otherInput.placeholder = defaultOtherTextPlaceholder
    } else {
      otherInput.placeholder = otherTextPlaceholder + (requireOther ? '' : ' (optional)')
    }
  } else if (fieldProperties.QUESTION_PLACEHOLDER_LABEL) {
    otherInput.placeholder = otherLabel + (requireOther ? '' : ' (optional)')
  } else {
    otherInput.placeholder = defaultOtherTextPlaceholder + (requireOther ? '' : ' (optional)') + '...'
  }

  otherInput.setAttribute('dir', 'auto')
  otherInput.setAttribute('autocomplete', 'off')
  otherInput.appendChild(document.createTextNode(inputValue))
  otherInput.classList.add('response', 'default-answer-text-size')
  otherContainer.appendChild(otherInput)

  radioButtonsContainer.insertBefore(otherChoiceContainer, radioButtonsContainer.firstChild)
  radioButtonsContainer.insertBefore(otherContainer, otherChoiceContainer.nextSibling)

  var hiddenDiv = document.querySelector('.hidden-text')
  if (hiddenDiv) {
    hiddenDiv.style.width = otherInput.offsetWidth + 'px'
  }

  var otherRadio = otherChoiceContainer.querySelector('input')
  if (selectedChoices.indexOf(otherValue) !== -1) {
    otherRadio.checked = true
    otherChoiceContainer.classList.add('selected')
  }

  otherInput.addEventListener('input', resizeTextBox)
  otherInput.oninput = function () {
    inputValue = otherInput.value
    setMetaData(String(selectedChoices) + '|' + inputValue)
    if (requireOther) {
      if (inputValue.length > 0) {
        setAnswer(String(selectedChoices))
        otherInput.classList.remove('blinking')
      } else {
        setAnswer('')
        otherInput.classList.add('blinking')
      }
    }
  }
}

function getSelectedChoices () {
  var selected = []
  var choiceContainers = document.querySelectorAll('.choice-container')
  for (var c = 0; c < choiceContainers.length; c++) {
    var choiceInput = choiceContainers[c].querySelector('input[name="opt"]')
    if (choiceInput && choiceInput.checked === true) {
      selected.push(choiceInput.value)
    }
  }
  selectedChoices = selected.join(' ')
}

function otherSelected (skipFocus) {
  if (String(selectedChoices).split(' ').indexOf(otherValue) !== -1) {
    otherContainer.style.display = 'inline'
    if (!skipFocus) {
      otherInput.focus()
    }
    metadata = getMetaData()
    if (requireOther && inputValue === '') {
      setAnswer('')
      otherInput.classList.add('blinking')
    } else {
      setAnswer(String(selectedChoices))
      otherInput.classList.remove('blinking')
    }
    return true
  }
  return false
}

function resizeTextBox () {
  if (!otherInput) return
  var hiddenDiv = document.querySelector('.hidden-text')
  if (!hiddenDiv) return
  var hiddenText = hiddenDiv.querySelector('p')
  hiddenDiv.style.display = 'block'
  hiddenDiv.style.width = otherInput.offsetWidth + 'px'
  hiddenText.innerHTML = otherInput.value.replace(/\n/g, '<br>\u200b')
  var newHeight = hiddenDiv.offsetHeight
  hiddenDiv.style.display = 'none'
  otherInput.style.height = newHeight + 'px'
}

function harvestChoicesFromDom () {
  var nodes = radioButtonsContainer.querySelectorAll('.choice-container:not([data-other-choice])')
  fuseChoiceRows = []
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i]
    var labelText = el.querySelector('.choice-label-text')
    var choiceInput = el.querySelector('input[name="opt"]')
    if (!labelText || !choiceInput) continue
    fuseChoiceRows.push({
      text: labelText.textContent.replace(/\s+/g, ' ').trim(),
      value: choiceInput.value,
      el: el
    })
  }
}

function keepOtherChoiceVisible () {
  if (otherChoiceContainer) {
    otherChoiceContainer.hidden = false
  }
}

function applyFilter (query) {
  query = String(query || '').trim()

  if (!query) {
    for (var i = 0; i < fuseChoiceRows.length; i++) {
      fuseChoiceRows[i].el.hidden = false
    }
    keepOtherChoiceVisible()
    return
  }

  if (!choiceFuse) {
    var q = query.toLowerCase()
    for (var j = 0; j < fuseChoiceRows.length; j++) {
      var row = fuseChoiceRows[j]
      row.el.hidden = row.text.toLowerCase().indexOf(q) === -1
    }
    keepOtherChoiceVisible()
    return
  }

  var results = choiceFuse.search(query)
  var show = {}
  for (var r = 0; r < results.length; r++) show[results[r].refIndex] = true
  for (var n = 0; n < fuseChoiceRows.length; n++) {
    fuseChoiceRows[n].el.hidden = !show[n]
  }
  keepOtherChoiceVisible()
}

function initSearchChoices () {
  harvestChoicesFromDom()
  ensureChoiceFuse(function () {
    applyFilter(input.value.trim())
  })
}

function ensureChoiceFuse (done) {
  if (choiceFuse) {
    done()
    return
  }
  var FuseCtor = typeof Fuse !== 'undefined' ? Fuse : null
  if (!FuseCtor) {
    console.error('Fuse.js failed to load')
    done()
    return
  }
  var fuseOpts = {
    threshold: threshold || defaultThreshold,
    distance: distance || defaultDistance,
    minMatchCharLength: minMatchCharLength || defaultMinMatchCharLength,
    ignoreLocation: ignoreLocation || defaultIgnoreLocation
  }
  choiceFuse = new FuseCtor(fuseChoiceRows, Object.assign({
    keys: ['text'],
    useTokenSearch: true
  }, fuseOpts))
  done()
}

input.addEventListener('input', function () {
  var query = input.value.trim()
  clearTimeout(filterTimer)
  filterTimer = setTimeout(function () {
    ensureChoiceFuse(function () {
      applyFilter(query)
    })
  }, filterDebounceMs)
})

if (otherEnabled) {
  setupOtherOption()
}

// Prepare the current webview, making adjustments for any appearance options

// minimal appearance
if (fieldProperties.APPEARANCE.includes('minimal') === true) {
  radioButtonsContainer.parentElement.removeChild(radioButtonsContainer)
  $('#filter-text').hide()
  likertContainer.parentElement.removeChild(likertContainer)
  selectDropDownContainer.style.display = 'block'
  $('#select-dropdown-container').select2({
    dropdownParent: $('#select-container'),
    placeholder: 'Select one answer',
    allowClear: false
  }).on('select2:open', function () {
    $('.select2-dropdown--above').attr('id', 'fix')
    $('#fix').removeClass('select2-dropdown--above')
    $('#fix').addClass('select2-dropdown--below')
  })
}
// likert appearance
else if (fieldProperties.APPEARANCE.includes('likert') === true) {
  radioButtonsContainer.parentElement.removeChild(radioButtonsContainer)
  selectDropDownContainer.parentElement.removeChild(selectDropDownContainer)
  likertContainer.style.display = 'flex'
  if (fieldProperties.APPEARANCE.includes('likert-min') === true) {
    var likertChoices = document.getElementsByClassName('likert-choice-container')
    for (var i = 1; i < likertChoices.length - 1; i++) {
      likertChoices[i].querySelector('.likert-choice-label').style.display = 'none'
    }
    likertChoices[0].querySelector('.likert-choice-label').classList.add('likert-min-choice-label-first')
    likertChoices[likertChoices.length - 1].querySelector('.likert-choice-label').classList.add('likert-min-choice-label-last')
  }
}
// all other appearances
else {
  if (fieldProperties.LANGUAGE !== null && isRTL(fieldProperties.LANGUAGE)) {
    radioButtonsContainer.dir = 'rtl'
  }

  selectDropDownContainer.parentElement.removeChild(selectDropDownContainer)
  likertContainer.parentElement.removeChild(likertContainer)

  if (fieldProperties.APPEARANCE.includes('quick') === true) {
    var choiceContainers = document.getElementsByClassName('choice-container')
    for (var qi = 0; qi < choiceContainers.length; qi++) {
      if (choiceContainers[qi].getAttribute('data-other-choice') === 'true') continue
      choiceContainers[qi].classList.add('appearance-quick')
      choiceContainers[qi].getElementsByClassName('choice-label-text')[0].insertAdjacentHTML('beforeend', '<svg class="quick-appearance-icon"><use xlink:href="#quick-appearance-icon" /></svg>')
    }
  }
}

function clearAnswer () {
  if (fieldProperties.APPEARANCE.includes('minimal') === true) {
    selectDropDownContainer.value = ''
  } else if (fieldProperties.APPEARANCE.includes('likert') === true) {
    var selectedLikert = document.querySelector('.likert-input-button.selected')
    if (selectedLikert) {
      selectedLikert.classList.remove('selected')
    }
  } else {
    var selectedOption = document.querySelector('input[name="opt"]:checked')
    if (selectedOption) {
      selectedOption.checked = false
      selectedOption.parentElement.classList.remove('selected')
    }
    if (otherEnabled && otherContainer) {
      otherContainer.style.display = 'none'
      otherInput.value = ''
      inputValue = ''
    }
  }
  if (otherEnabled) {
    setAnswer('')
  }
}

function change () {
  if (handlingChange) return
  handlingChange = true
  try {
    if (otherEnabled) {
      selectedChoices = String(this.value)
      if (!otherSelected()) {
        otherContainer.style.display = 'none'
        setAnswer(this.value)
        if (fieldProperties.APPEARANCE.includes('quick') === true) {
          goToNextField()
        }
      }
      setMetaData(String(selectedChoices) + '|' + inputValue)
      return
    }
    setAnswer(this.value)
    if (fieldProperties.APPEARANCE.includes('quick') === true) {
      goToNextField()
    }
  } finally {
    handlingChange = false
  }
}

if (fieldProperties.APPEARANCE.includes('minimal') === true) {
  selectDropDownContainer.onchange = change
} else if (fieldProperties.APPEARANCE.includes('likert') === true) {
  var likertButtons = document.querySelectorAll('div[name="opt"]')
  for (var lb = 0; lb < likertButtons.length; lb++) {
    likertButtons[lb].onclick = function () {
      var selectedLikertBtn = document.querySelector('.likert-input-button.selected')
      if (selectedLikertBtn) {
        selectedLikertBtn.classList.remove('selected')
      }
      this.classList.add('selected')
      change.apply({ value: this.getAttribute('data-value') })
    }
  }
} else {
  radioButtonsContainer.addEventListener('change', function (e) {
    var target = e.target
    if (target.name !== 'opt') return
    var selectedChoice = radioButtonsContainer.querySelector('.choice-container.selected')
    if (selectedChoice) {
      selectedChoice.classList.remove('selected')
    }
    target.parentElement.classList.add('selected')
    change.apply(target)
  })
}

if (!fieldProperties.APPEARANCE.includes('minimal') && !fieldProperties.APPEARANCE.includes('likert')) {
  initSearchChoices()
}

if (otherEnabled) {
  handlingChange = true
  try {
    getSelectedChoices()
    otherSelected(true)
    resizeTextBox()
  } finally {
    handlingChange = false
  }
}

function unEntity (str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}
if (fieldProperties.LABEL) {
  document.querySelector('.label').innerHTML = unEntity(fieldProperties.LABEL)
}
if (fieldProperties.HINT) {
  document.querySelector('.hint').innerHTML = unEntity(fieldProperties.HINT)
}
