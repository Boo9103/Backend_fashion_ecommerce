
exports.validatePriceRange = (minStr, maxStr) => {
  const min = minStr ? parseFloat(minStr) : undefined;
  const max = maxStr ? parseFloat(maxStr) : undefined;

  if (min !== undefined && (isNaN(min) || min < 0)) {
    throw new Error('min_price must be a positive number');
  }
  if (max !== undefined && (isNaN(max) || max < 0)) {
    throw new Error('max_price must be a positive number');
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error('min_price must be less than or equal to max_price');
  }

  return { min, max };
};

exports.validateStockQuantity = (stockStr, field = 'stock_qty')=>{
    const stock = parseInt(stockStr, 10);
    if(isNaN(stock) || stock < 0){
        throw new Error(`${field} must be a non-negative integer`);
    }
    return stock;
};

exports.validateSoldQuantity = (soldStr, field = 'sold_qty')=>{
    const sold = parseFloat(soldStr);
    if(isNaN(sold) || sold < 0){
        throw new Error(`${field} must be a non-negative number`);
    }
    return sold ?? 0;
};

//validate price
exports.validatePrice = (priceStr)=>{
    const price = parseFloat(priceStr);
    if(isNaN(price) || price <= 0){
        throw new Error(`price must be a non-negative number`);
    }   
    return price;
};

//validate sale percent
exports.validateSalePercent = (percentStr)=>{
    const percent = parseFloat(percentStr);
    if(isNaN(percent) || percent < 0 || percent > 100){
        throw new Error(`sale_percent must be a number between 0 and 100`);
    }
    return percent;
};
