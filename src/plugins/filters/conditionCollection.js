import { arrayEach, arrayMap, arrayFilter } from '../../helpers/array';
import { objectEach, mixin } from '../../helpers/object';
import { toSingleLine } from '../../helpers/templateLiteralTag';
import localHooks from '../../mixins/localHooks';
import { getCondition } from './conditionRegisterer';
import { OPERATION_ID as OPERATION_AND } from './logicalOperations/conjunction';
import { operations, getOperationFunc } from './logicalOperationRegisterer';

/**
 * @class ConditionCollection
 * @plugin Filters
 */
class ConditionCollection {
  constructor() {
    /**
     * Conditions collection grouped by operation type and then column index.
     *
     * @type {object}
     */
    this.conditions = this.initConditionsCollection();

    /**
     * Types of operations grouped by column index.
     *
     * @type {object}
     */
    this.columnTypes = {};

    /**
     * Order of added condition filters.
     *
     * @type {Array}
     */
    this.orderStack = [];
  }

  /**
   * Check if condition collection is empty (so no needed to filter data).
   *
   * @returns {boolean}
   */
  isEmpty() {
    return !this.orderStack.length;
  }

  /**
   * Check if value is matched to the criteria of conditions chain.
   *
   * @param {object} value Object with `value` and `meta` keys.
   * @param {number} [column] Column index.
   * @returns {boolean}
   */
  isMatch(value, column) {
    let result = true;

    if (column === void 0) {
      objectEach(this.columnTypes, (columnType, columnIndex) => {
        result = this.isMatchInConditions(this.conditions[columnType][columnIndex], value, columnType);

        return result;
      });

    } else {
      const columnType = this.columnTypes[column];

      result = this.isMatchInConditions(this.getConditions(column), value, columnType);
    }

    return result;
  }

  /**
   * Check if the value is matches the conditions.
   *
   * @param {Array} conditions List of conditions.
   * @param {object} value Object with `value` and `meta` keys.
   * @param {string} [operationType='conjunction'] Type of conditions operation.
   * @returns {boolean}
   */
  isMatchInConditions(conditions, value, operationType = OPERATION_AND) {
    let result = false;

    if (conditions.length) {
      result = getOperationFunc(operationType)(conditions, value);

    } else {
      result = true;
    }

    return result;
  }

  /**
   * Add condition to the collection.
   *
   * @param {number} column Column index.
   * @param {object} conditionDefinition Object with keys:
   *  * `command` Object, Command object with condition name as `key` property.
   *  * `args` Array, Condition arguments.
   * @param {string} [operation='conjunction'] Type of conditions operation.
   * @fires ConditionCollection#beforeAdd
   * @fires ConditionCollection#afterAdd
   */
  addCondition(column, conditionDefinition, operation = OPERATION_AND) {
    const args = arrayMap(conditionDefinition.args, v => (typeof v === 'string' ? v.toLowerCase() : v));
    const name = conditionDefinition.name || conditionDefinition.command.key;

    this.runLocalHooks('beforeAdd', column);

    if (this.orderStack.indexOf(column) === -1) {
      this.orderStack.push(column);
    }

    const columnType = this.columnTypes[column];

    if (columnType) {
      if (columnType !== operation) {
        throw Error(toSingleLine`The column of index ${column} has been already applied with a \`${columnType}\`\x20
        filter operation. Use \`removeConditions\` to clear the current conditions and then add new ones.\x20
        Mind that you cannot mix different types of operations (for instance, if you use \`conjunction\`,\x20
        use it consequently for a particular column).`);
      }

    } else {
      if (!this.conditions[operation]) {
        throw new Error(toSingleLine`Unexpected operation named \`${operation}\`. Possible ones are\x20
          \`disjunction\` and \`conjunction\`.`);
      }

      this.columnTypes[column] = operation;
    }

    // Add condition
    this.getConditions(column).push({
      name,
      args,
      func: getCondition(name, args)
    });

    this.runLocalHooks('afterAdd', column);
  }

  /**
   * Get all added conditions from the collection at specified column index.
   *
   * @param {number} column Column index.
   * @returns {Array} Returns conditions collection as an array.
   */
  getConditions(column) {
    const columnType = this.columnTypes[column];

    if (!columnType) {
      return [];
    }

    if (!this.conditions[columnType][column]) {
      this.conditions[columnType][column] = [];
    }

    return this.conditions[columnType][column];
  }

  /**
   * Export all previously added conditions.
   *
   * @returns {Array}
   */
  exportAllConditions() {
    const result = [];

    arrayEach(this.orderStack, (column) => {
      const conditions = arrayMap(this.getConditions(column), ({ name, args }) => ({ name, args }));
      const operation = this.columnTypes[column];

      result.push({
        column,
        operation,
        conditions
      });
    });

    return result;
  }

  /**
   * Import conditions to the collection.
   *
   * @param {Array} conditions The collection of the conditions.
   */
  importAllConditions(conditions) {
    this.clean();

    arrayEach(conditions, (stack) => {
      this.orderStack.push(stack.column);

      arrayEach(stack.conditions, condition => this.addCondition(stack.column, condition));
    });
  }

  /**
   * Remove conditions at given column index.
   *
   * @param {number} column Column index.
   * @fires ConditionCollection#beforeRemove
   * @fires ConditionCollection#afterRemove
   */
  removeConditions(column) {
    this.runLocalHooks('beforeRemove', column);

    if (this.orderStack.indexOf(column) >= 0) {
      this.orderStack.splice(this.orderStack.indexOf(column), 1);
    }
    this.clearConditions(column);
    this.runLocalHooks('afterRemove', column);
  }

  /**
   * Clear conditions at specified column index but without clearing stack order.
   *
   * @param {number}column Column index.
   * @fires ConditionCollection#beforeClear
   * @fires ConditionCollection#afterClear
   */
  clearConditions(column) {
    this.runLocalHooks('beforeClear', column);
    this.getConditions(column).length = 0;
    delete this.columnTypes[column];
    this.runLocalHooks('afterClear', column);
  }

  /**
   * Check if at least one condition was added at specified column index. And if second parameter is passed then additionally
   * check if condition exists under its name.
   *
   * @param {number} column Column index.
   * @param {string} [name] Condition name.
   * @returns {boolean}
   */
  hasConditions(column, name) {
    const columnType = this.columnTypes[column];
    let result = false;

    if (!columnType) {
      return false;
    }

    const conditions = this.getConditions(column);

    if (name) {
      result = arrayFilter(conditions, condition => condition.name === name).length > 0;
    } else {
      result = conditions.length > 0;
    }

    return result;
  }

  /**
   * Clean all conditions collection and reset order stack.
   *
   * @fires ConditionCollection#beforeClean
   * @fires ConditionCollection#afterClean
   */
  clean() {
    this.runLocalHooks('beforeClean');
    this.columnTypes = Object.create(null);
    this.orderStack.length = 0;
    this.conditions = this.initConditionsCollection();
    this.runLocalHooks('afterClean');
  }

  /**
   * Destroy object.
   */
  destroy() {
    this.clearLocalHooks();
    this.conditions = null;
    this.orderStack = null;
    this.columnTypes = null;
  }

  /**
   * Init conditions collection.
   *
   * @private
   * @returns {object} Returns an initial bucket for conditions.
   */
  initConditionsCollection() {
    const conditions = Object.create(null);

    objectEach(operations, (_, operation) => {
      conditions[operation] = Object.create(null);
    });

    return conditions;
  }
}

mixin(ConditionCollection, localHooks);

export default ConditionCollection;
