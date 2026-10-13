import polars as pl

from app.api.routes.schemas import _infer_expected_columns


def test_expected_schema_is_inferred_from_dataset_columns_and_values():
    first_schema = _infer_expected_columns(
        pl.DataFrame(
            {
                "account_id": [1, 2],
                "segment": ["new", "returning"],
                "balance": [10.5, 20.0],
            }
        )
    )
    second_schema = _infer_expected_columns(
        pl.DataFrame(
            {
                "order_code": ["A", "B"],
                "active": [True, False],
                "quantity": [1, 3],
            }
        )
    )

    assert [column["name"] for column in first_schema] == ["account_id", "segment", "balance"]
    assert [column["data_type"] for column in first_schema] == ["integer", "string", "float"]
    assert first_schema[1]["allowed_values"] == ["new", "returning"]
    assert first_schema[2]["min_value"] == 10.5
    assert first_schema[2]["max_value"] == 20.0

    assert [column["name"] for column in second_schema] == ["order_code", "active", "quantity"]
    assert [column["data_type"] for column in second_schema] == ["string", "boolean", "integer"]
    assert set(second_schema[1]["allowed_values"]) == {True, False}
