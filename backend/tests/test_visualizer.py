import polars as pl
import pytest

from app.engine.visualizer import generate_chart, metadata


@pytest.fixture
def sample_frame():
    return pl.DataFrame(
        {
            "age": [20, 21, 22, 23, None, 100],
            "income": [30.0, 31.0, 33.0, 35.0, 36.0, 90.0],
            "segment": ["A", "A", "B", "B", "B", "A"],
        }
    )


def test_metadata_recommends_charts_and_classifies_columns(sample_frame):
    result = metadata(sample_frame, "dataset", "version", 1)

    assert result["numeric_columns"] == ["age", "income"]
    assert result["categorical_columns"] == ["segment"]
    assert "age" in result["missing_columns"]
    assert any(item["chart_type"] == "scatter" for item in result["recommendations"])


def test_histogram_is_bounded_and_reports_insights(sample_frame):
    result = generate_chart(sample_frame, "histogram", ["age"], None, None, None, 5, "pearson", 100)

    assert len(result["data"]) == 5
    assert result["insights"][0]["label"] == "Mean"
    assert result["metadata"]["sample_size"] == 6


def test_missing_values_and_grouped_box(sample_frame):
    missing = generate_chart(sample_frame, "missing_bar", [], None, None, None, 20, "pearson", 100)
    grouped = generate_chart(sample_frame, "grouped_box", ["income", "segment"], None, None, None, 20, "pearson", 100)

    assert missing["data"][0]["missing"] == 1
    assert {item["group"] for item in grouped["data"]} == {"A", "B"}


def test_invalid_column_and_chart_type_are_rejected(sample_frame):
    with pytest.raises(ValueError, match="Unknown column"):
        generate_chart(sample_frame, "histogram", ["unknown"], None, None, None, 20, "pearson", 100)

    with pytest.raises(ValueError, match="numerical column"):
        generate_chart(sample_frame, "histogram", ["segment"], None, None, None, 20, "pearson", 100)


def test_pair_plot_2x2_matrix(sample_frame):
    result = generate_chart(sample_frame, "pair_plot", ["age", "income"], None, None, None, 15, "pearson", 100)
    data = result["data"]
    assert data["matrix_size"] == 2
    assert data["columns"] == ["age", "income"]
    assert len(data["cells"]) == 2
    assert len(data["cells"][0]) == 2
    assert data["cells"][0][0]["is_diagonal"] is True
    assert data["cells"][0][1]["is_diagonal"] is False
    assert data["cells"][1][0]["is_diagonal"] is False
    assert data["cells"][1][1]["is_diagonal"] is True
    assert "age" in data["diagonal"]
    assert "income" in data["diagonal"]
    assert len(data["diagonal"]["age"]["histogram"]) > 0
    assert data["diagonal"]["age"]["stats"]["count"] == 5
    assert "age__income" in data["correlations"]
    assert isinstance(data["correlations"]["age__income"], float)
    assert len(data["sample_points"]) > 0


def test_pair_plot_3x3_and_4x4_and_5x5_matrices():
    df_5 = pl.DataFrame({
        "temp": [20.0, 22.5, 21.0, 25.0, 26.5, 19.0, 30.0, 28.0],
        "pressure": [1013.0, 1012.0, 1015.0, 1010.0, 1008.0, 1018.0, 1005.0, 1007.0],
        "humidity": [60.0, 65.0, 58.0, 72.0, 75.0, 55.0, 80.0, 78.0],
        "wind_speed": [5.0, 7.5, 6.0, 12.0, 15.0, 4.0, 18.0, 14.0],
        "radiation": [200.0, 250.0, 210.0, 300.0, 320.0, 180.0, 350.0, 330.0],
    })

    # 3x3
    res_3 = generate_chart(df_5, "pair_plot", ["temp", "pressure", "humidity"], None, None, None, 10, "pearson", 100)
    assert res_3["data"]["matrix_size"] == 3
    assert len(res_3["data"]["cells"]) == 3
    assert len(res_3["data"]["cells"][0]) == 3

    # 4x4
    res_4 = generate_chart(df_5, "pair_plot", ["temp", "pressure", "humidity", "wind_speed"], None, None, None, 10, "pearson", 100)
    assert res_4["data"]["matrix_size"] == 4
    assert len(res_4["data"]["cells"]) == 4

    # 5x5
    res_5 = generate_chart(df_5, "pair_plot", ["temp", "pressure", "humidity", "wind_speed", "radiation"], None, None, None, 10, "pearson", 100)
    assert res_5["data"]["matrix_size"] == 5
    assert len(res_5["data"]["cells"]) == 5
    assert len(res_5["data"]["cells"][4]) == 5
    assert res_5["data"]["cells"][4][4]["is_diagonal"] is True


def test_pair_plot_edge_cases():
    # 1. Constant column
    df_const = pl.DataFrame({
        "var_a": [10.0, 20.0, 30.0, 40.0],
        "var_const": [5.0, 5.0, 5.0, 5.0],
    })
    res_const = generate_chart(df_const, "pair_plot", ["var_a", "var_const"], None, None, None, 10, "pearson", 100)
    assert res_const["data"]["matrix_size"] == 2
    assert res_const["data"]["correlations"]["var_a__var_const"] == 0.0

    # 2. Long column names
    long_col1 = "Extremely_Long_Measurement_Parameter_Alpha_X1"
    long_col2 = "Another_Substantially_Protracted_Indicator_Beta_Y2"
    df_long = pl.DataFrame({
        long_col1: [1.0, 2.0, 3.0, 4.0],
        long_col2: [10.0, 20.0, 30.0, 40.0],
    })
    res_long = generate_chart(df_long, "pair_plot", [long_col1, long_col2], None, None, None, 10, "pearson", 100)
    assert res_long["data"]["matrix_size"] == 2
    assert long_col1 in res_long["data"]["diagonal"]

    # 3. Missing values & nulls
    df_nulls = pl.DataFrame({
        "col_a": [None, 2.0, None, 4.0, 5.0],
        "col_b": [10.0, None, 30.0, 40.0, 50.0],
    })
    res_nulls = generate_chart(df_nulls, "pair_plot", ["col_a", "col_b"], None, None, None, 10, "pearson", 100)
    assert res_nulls["data"]["matrix_size"] == 2

    # 4. Large dataset sampling
    import random
    n = 1000
    df_large = pl.DataFrame({
        "metric_x": [random.random() * 100 for _ in range(n)],
        "metric_y": [random.random() * 50 for _ in range(n)],
    })
    res_large = generate_chart(df_large, "pair_plot", ["metric_x", "metric_y"], None, None, None, 15, "pearson", 200)
    assert res_large["metadata"]["sampled"] is True
    assert len(res_large["data"]["sample_points"]) <= 200

    # 5. Only 1 numeric column -> rejects with exact message
    df_one = pl.DataFrame({"only_num": [1, 2, 3], "category": ["A", "B", "C"]})
    with pytest.raises(ValueError, match="Pair plot requires at least two compatible numeric columns"):
        generate_chart(df_one, "pair_plot", ["only_num"], None, None, None, 10, "pearson", 100)

    # 6. No numeric columns -> rejects with exact message
    df_zero = pl.DataFrame({"category": ["A", "B", "C"], "label": ["X", "Y", "Z"]})
    with pytest.raises(ValueError, match="Pair plot requires at least two compatible numeric columns"):
        generate_chart(df_zero, "pair_plot", [], None, None, None, 10, "pearson", 100)

