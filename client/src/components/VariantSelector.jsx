import React from 'react';
import { colorStyle, variantColor, variantConfiguration } from '../utils/variant-colors.js';
export function VariantSelector({ variants, selected, onChange }) {
  const colors = [...new Set(variants.map(variantColor).filter(Boolean))];
  const selectedColor = variantColor(selected);
  const choices = selectedColor
    ? variants.filter((v) => variantColor(v) === selectedColor)
    : variants;
  function selectColor(color) {
    const candidates = variants.filter((v) => variantColor(v) === color);
    onChange(
      candidates.find((v) => variantConfiguration(v) === variantConfiguration(selected)) ||
        candidates[0],
    );
  }
  return (
    <div className="detail-variant-box">
      {colors.length > 0 && (
        <fieldset className="color-options">
          <legend>
            Colour: <strong>{selectedColor}</strong>
          </legend>
          <div className="color-swatches">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={'color-swatch' + (color === selectedColor ? ' is-selected' : '')}
                aria-label={'Colour: ' + color}
                aria-pressed={color === selectedColor}
                title={color}
                onClick={() => selectColor(color)}
              >
                {colorStyle(color) ? (
                  <span className="color-swatch-fill" style={{ background: colorStyle(color) }} />
                ) : (
                  <span className="color-swatch-name">{color}</span>
                )}
                {color === selectedColor && (
                  <span className="color-swatch-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {(choices.length > 1 || !colors.length) && (
        <fieldset className="configuration-options">
          <legend>{colors.length ? 'Configuration' : 'Choose your model'}</legend>
          <div className="variant-pills-row">
            {choices.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === selected?.id}
                className={'variant-option-pill ' + (v.id === selected?.id ? 'active' : '')}
                onClick={() => onChange(v)}
              >
                {variantConfiguration(v) || v.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <p className="selected-variant" aria-live="polite">
        Selected: {selected?.name}
      </p>
    </div>
  );
}
