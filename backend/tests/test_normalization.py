from project_pepsi.normalization import normalize_listing


def test_normalizes_watch_reference_and_price_from_submitted_text():
    result = normalize_listing("https://example.test/listing", "Omega Seamaster Diver 300M ref 210.30.42.20.01.001 asking $3,200")
    assert result["brand"] == "Omega"
    assert result["model"] == "Seamaster Diver 300M"
    assert result["reference"] == "210.30.42.20.01.001"
    assert result["ask"] == 3200
