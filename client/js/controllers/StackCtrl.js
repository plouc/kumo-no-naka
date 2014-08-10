angular.module('cloudpie').controller('StackCtrl', [
    '$scope',
    'StackService',
    'StackLayoutManager',
    'StackFilters',
    function (
        $scope,
        StackService,
        StackLayoutManager,
        StackFilters
    ) {
        $scope.viz = {
            width:  500,
            height: 500
        };

        $scope.refreshFilters = function () {
            if (!$scope.filters) { return; }

            StackFilters.filter();
        };

        StackService.get().then(function (stack) {

            $scope.filters = StackFilters.build(stack);

            StackLayoutManager.compute(stack);

            $scope.instances      = stack.instances;
            $scope.amis           = stack.amis;
            $scope.securityGroups = stack.securityGroups;
            $scope.vpcs           = stack.vpcs;
            $scope.loadBalancers  = stack.loadBalancers;
            $scope.tags           = stack.tags;
        });
    }
]);