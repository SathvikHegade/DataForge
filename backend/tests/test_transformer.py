import polars as pl
import pytest

from app.engine.transformer import DataTransformer
from app.engine.preview import TransformationPreviewEngine


def test_string_numbers_convert_and_invalid_values_are_reported():
    frame = pl.DataFrame({"amount": ["1.5", "bad", None, "3"]})

    result, summary = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {"column": "amount", "target_type": "float", "invalid_strategy": "coerce_null"},
    )

    assert result["amount"].dtype == pl.Float64
    assert result["amount"].to_list() == [1.5, None, None, 3.0]
    assert summary["details"]["invalid_count"] == 1
    assert summary["details"]["new_null_count"] == 1


def test_string_numeric_cleanup_handles_salary_like_values_generically():
    frame = pl.DataFrame({"salary": ["$75,000", "salary 95000", "USD 120000", "N/A", "-", None]})

    result, summary = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {"column": "salary", "target_type": "integer", "invalid_strategy": "coerce_null"},
    )

    assert result["salary"].to_list() == [75000, 95000, 120000, None, None, None]
    assert summary["details"]["invalid_count"] == 2
    assert summary["details"]["new_null_count"] == 2


def test_numeric_cast_does_not_extract_digits_from_unrelated_text():
    result, summary = DataTransformer.apply_transformation(
        pl.DataFrame({"value": ["abc123", "salary 95000"]}),
        "cast_type",
        {"column": "value", "target_type": "integer", "invalid_strategy": "coerce_null"},
    )

    assert result["value"].to_list() == [None, 95000]
    assert summary["details"]["invalid_count"] == 1


def test_boolean_conversion_does_not_use_python_truthiness():
    frame = pl.DataFrame({"flag": ["true", "false", "yes", "0", "unknown", None]})

    result, summary = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {"column": "flag", "target_type": "boolean", "invalid_strategy": "coerce_null"},
    )

    assert result["flag"].to_list() == [True, False, True, False, None, None]
    assert summary["details"]["invalid_count"] == 1


def test_date_datetime_and_categorical_conversion_are_dynamic():
    frame = pl.DataFrame({"when": ["2025-01-01", "invalid"], "label": ["a", "b"]})

    date_frame, date_summary = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {"column": "when", "target_type": "date", "invalid_strategy": "coerce_null"},
    )
    datetime_frame, _ = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {"column": "when", "target_type": "datetime", "invalid_strategy": "coerce_null"},
    )
    categorical_frame, _ = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {"column": "label", "target_type": "categorical", "invalid_strategy": "raise"},
    )

    assert date_frame["when"].dtype == pl.Date
    assert date_frame["when"].null_count() == 1
    assert date_summary["details"]["invalid_count"] == 1
    assert datetime_frame["when"].dtype == pl.Datetime
    assert categorical_frame["label"].dtype == pl.Categorical


def test_replace_default_uses_typed_boolean_value():
    frame = pl.DataFrame({"flag": ["true", "unknown", None]})

    result, summary = DataTransformer.apply_transformation(
        frame,
        "cast_type",
        {
            "column": "flag",
            "target_type": "boolean",
            "invalid_strategy": "replace_default",
            "default_value": "false",
        },
    )

    assert result["flag"].to_list() == [True, False, False]
    assert summary["details"]["invalid_count"] == 1
    assert summary["details"]["new_null_count"] == 0


def test_raise_rejects_invalid_values_without_silent_data_loss():
    with pytest.raises(ValueError, match="cannot be converted"):
        DataTransformer.apply_transformation(
            pl.DataFrame({"value": ["1", "bad"]}),
            "cast_type",
            {"column": "value", "target_type": "integer", "invalid_strategy": "raise"},
        )


def test_nan_is_handled_as_missing_for_imputation():
    result, _ = DataTransformer.apply_transformation(
        pl.DataFrame({"value": [1.0, float("nan"), None, 3.0]}),
        "fill_missing_mean",
        {"columns": ["value"]},
    )

    assert result["value"].to_list() == [1.0, 2.0, 2.0, 3.0]


def test_conversion_preview_exposes_valid_and_invalid_counts():
    preview = TransformationPreviewEngine.preview(
        pl.DataFrame({"value": ["1", "bad", None]}),
        "cast_type",
        {"column": "value", "target_type": "integer", "invalid_strategy": "coerce_null"},
    )

    assert preview["details"]["valid_count"] == 1
    assert preview["details"]["invalid_count"] == 1


def test_transformations_reject_unknown_options():
    frame = pl.DataFrame({"value": [1.0, 2.0, 100.0]})

    with pytest.raises(ValueError, match="ordered categories"):
        DataTransformer.apply_transformation(
            pl.DataFrame({"priority": ["Low", "High"]}),
            "ordinal_encode",
            {"column": "priority", "order": '["Low", "High"]'},
        )
    with pytest.raises(ValueError, match="case"):
        DataTransformer.apply_transformation(frame, "change_case", {"columns": ["value"], "case": "sideways"})
    with pytest.raises(ValueError, match="method"):
        DataTransformer.apply_transformation(frame, "handle_outliers", {"columns": ["value"], "method": "unknown"})
