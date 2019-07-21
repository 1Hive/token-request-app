const DAOFactory = artifacts.require('DAOFactory')
const EVMScriptRegistryFactory = artifacts.require('EVMScriptRegistryFactory')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')

export default class DaoDeployment {

    async deployBefore() {
        await this.createStatelessContracts()
    }

    async createStatelessContracts() {
        this.kernelBase = await Kernel.new(true)
        this.aclBase = await ACL.new()
        this.evmScriptRegistryFactory = await EVMScriptRegistryFactory.new()
        this.daoFactory = await DAOFactory.new(this.kernelBase.address, this.aclBase.address, this.evmScriptRegistryFactory.address)
    }

    async deployBeforeEach(ownerAddress) {
        await this.createDaoProxyContractsAndPermission(ownerAddress)
    }

    async createDaoProxyContractsAndPermission(ownerAddress) {
        const newKernelReceipt = await this.daoFactory.newDAO(ownerAddress)
        this.kernel = await Kernel.at(newKernelReceipt.logs.filter(log => log.event === 'DeployDAO')[0].args.dao)
        this.acl = await ACL.at(await this.kernel.acl())

        const APP_MANAGER_ROLE = await this.kernelBase.APP_MANAGER_ROLE()
        await this.acl.createPermission(ownerAddress, this.kernel.address, APP_MANAGER_ROLE, ownerAddress, {from: ownerAddress})
    }
}
